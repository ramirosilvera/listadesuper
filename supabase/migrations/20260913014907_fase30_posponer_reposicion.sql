-- Fase 30: "posponer" reposición para productos de consumo irregular
-- (/consejo con el usuario, roles Arquitectura/Datos + UX + Pragmático).
--
-- Problema real: hay productos que se consumen de forma irregular -- ni
-- el ciclo de compra ni la predicción por consumo (ambas son INFERENCIAS
-- automáticas basadas en tiempo/patrón) aciertan bien ahí, y generan
-- avisos que no corresponden. Archivar es demasiado permanente (lo saca
-- del todo); no tocar nada genera ruido constante. Se confirmó contra los
-- datos reales antes de diseñar esto: los 69 productos con ciclo
-- configurado hoy corren sobre la estimación de arranque (Fase 6), sin
-- ninguna evidencia real todavía -- no es un caso raro, es el estado
-- normal del hogar recién empezando.
--
-- Se reusa product_suggestion_dismissals (ya existe para "descartar
-- sugerencias de ajuste de configuración" en Reportes) en vez de crear
-- una tabla nueva -- mismo mecanismo, un suggestion_type más
-- ('reposicion_pospuesta'), con una columna nueva (dismissed_until) que
-- los otros tres tipos no usan (esos se descartan hasta que cambie el
-- valor sugerido, no por un plazo fijo).
--
-- El posponer SOLO silencia ciclo_de_compra y prediccion (inferencias
-- automáticas) -- nunca needs_restock (marca manual) ni umbral_manual
-- (umbral que la persona configuró a propósito): esas son señales
-- explícitas y siempre ganan, con o sin posponer activo. Verificado en
-- vivo contra los datos reales antes de dejar esta migración: marcar
-- needs_restock=true con un posponer activo sigue disparando
-- should_restock=true igual, y sacar el posponer devuelve el estado
-- exacto anterior.
alter table product_suggestion_dismissals
  add column dismissed_until timestamptz;

alter table product_suggestion_dismissals
  drop constraint product_suggestion_dismissals_suggestion_type_check;

alter table product_suggestion_dismissals
  add constraint product_suggestion_dismissals_suggestion_type_check
  check (suggestion_type = any (array['ciclo_de_compra', 'umbral_manual', 'archivar', 'reposicion_pospuesta']));

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
end;
$function$;

create or replace function unsnooze_restock(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from products where id = p_product_id;
  if v_household_id is null or not private.is_household_member(v_household_id) then
    raise exception 'not authorized';
  end if;

  delete from product_suggestion_dismissals
  where product_id = p_product_id and suggestion_type = 'reposicion_pospuesta';
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
