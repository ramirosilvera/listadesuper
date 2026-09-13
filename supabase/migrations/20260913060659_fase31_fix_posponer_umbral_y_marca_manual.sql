-- Fase 31: corrige un problema real reportado por el usuario -- pospuso
-- "Choclo en lata" y le siguió apareciendo en "Se están por acabar".
--
-- Causa confirmada contra los datos reales: el motivo de "Choclo en
-- lata" era 'umbral_manual' (quantity_on_hand llegó a 0, por debajo del
-- low_stock_threshold configurado), y en Fase 30 se decidió a propósito
-- que umbral_manual SIEMPRE gana al posponer, por ser "una decisión
-- explícita de la persona". En la práctica eso no coincide con lo que
-- espera quien pospone: un umbral configurado hace tiempo puede quedar
-- tan desactualizado como un ciclo, no hay motivo real para que sea la
-- excepción. Se corrige: posponer ahora también apaga umbral_manual.
--
-- Igual de importante: si el producto estaba marcado manualmente
-- (needs_restock=true) en el momento de posponerlo, la vista lo seguiría
-- disparando igual (esa rama nunca se apaga a propósito, ver Fase 30) --
-- sin desmarcarlo, "posponer" no hace nada visible. snooze_restock ahora
-- también desmarca needs_restock al posponer. Si más adelante la persona
-- vuelve a marcarlo a mano, esa marca fresca sigue ganando igual que
-- antes (ya verificado en Fase 30, no se tocó esa parte).
create or replace function snooze_restock(p_product_id uuid, p_days int default 30)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_household_id uuid;
begin
  if p_days is null or p_days <= 0 then
    raise exception 'p_days debe ser mayor a 0';
  end if;

  select household_id into v_household_id from products where id = p_product_id;
  if v_household_id is null or not private.is_household_member(v_household_id) then
    raise exception 'not authorized';
  end if;

  insert into product_suggestion_dismissals
    (household_id, product_id, suggestion_type, dismissed_until, dismissed_by)
  values
    (v_household_id, p_product_id, 'reposicion_pospuesta', now() + make_interval(days => p_days), auth.uid())
  on conflict (product_id, suggestion_type)
  do update set dismissed_until = excluded.dismissed_until, dismissed_at = now(), dismissed_by = excluded.dismissed_by;

  update products set needs_restock = false where id = p_product_id and needs_restock = true;
end;
$function$;

create or replace view product_replenishment
  with (security_invoker = true)
as
select
  p.id as product_id,
  p.household_id,
  p.name,
  p.unit_label,
  p.low_stock_threshold,
  coalesce(ps.quantity_on_hand, 0) as quantity_on_hand,
  calc.avg_daily_consumption,
  case
    when calc.avg_daily_consumption > 0
      then coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption
    else null
  end as estimated_days_remaining,
  case
    when p.needs_restock then true
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      and snooze.dismissed_until is null
      then true
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      and snooze.dismissed_until is null
      then true
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 6
      and snooze.dismissed_until is null
      then true
    else false
  end as should_restock,
  case
    when p.needs_restock then 'marcado_manual'
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      and snooze.dismissed_until is null
      then 'prediccion'
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      and snooze.dismissed_until is null
      then 'umbral_manual'
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 6
      and snooze.dismissed_until is null
      then 'ciclo_de_compra'
    else null
  end as restock_reason,
  p.restock_cycle_days,
  last_restock.last_restocked_at,
  case
    when last_restock.last_restocked_at is not null
      then extract(day from now() - last_restock.last_restocked_at)::int
    else null
  end as days_since_last_restock,
  case
    when snooze.dismissed_until is not null then null
    when p.restock_cycle_days is not null and last_restock.last_restocked_at is not null then
      case
        when (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 0
          then 'vencido'
        when (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 6
          then 'esta_semana'
        when (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 13
          then 'proxima_semana'
        else null
      end
    else null
  end as cycle_urgency,
  snooze.dismissed_until as restock_snoozed_until
from products p
left join product_stock ps
  on ps.product_id = p.id and ps.household_id = p.household_id
left join lateral (
  select
    case
      when count(*) filter (where sm.delta < 0) >= 2
        and extract(day from now() - min(sm.created_at) filter (where sm.delta < 0)) >= 3
      then
        coalesce(sum(-sm.delta) filter (where sm.delta < 0), 0)
        / greatest(3, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0))))
      else null
    end as avg_daily_consumption
  from stock_movements sm
  where sm.product_id = p.id
    and sm.household_id = p.household_id
    and sm.created_at >= now() - interval '90 days'
) calc on true
left join lateral (
  select max(sm2.created_at) as last_restocked_at
  from stock_movements sm2
  where sm2.product_id = p.id
    and sm2.household_id = p.household_id
    and sm2.delta > 0
) last_restock on true
left join lateral (
  select d.dismissed_until
  from product_suggestion_dismissals d
  where d.product_id = p.id
    and d.suggestion_type = 'reposicion_pospuesta'
    and d.dismissed_until > now()
) snooze on true
where p.archived = false;

-- El posponer de "Choclo en lata" ya estaba guardado (vence 13/10) --
-- con la vista corregida, debería dejar de aparecer ahora mismo sin que
-- la persona tenga que volver a tocar el botón.
