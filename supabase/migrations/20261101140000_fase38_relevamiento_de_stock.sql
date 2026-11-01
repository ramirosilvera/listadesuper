-- Fase 38: relevamiento asistido de stock (/consejo).
--
-- Problema: se compra mucho y casi no se carga el consumo (127 compras
-- contra 15 consumos en 6 semanas), asi que el stock figura inflado. Se
-- descarto resetear el stock solo (fabricaria una cantidad sin que nadie la
-- vea); en cambio la app detecta que stock es dudoso y se lo hace confirmar
-- a la persona en un repaso rapido. Esta migracion pone la base:
--
-- 1) Motivo nuevo 'count' en stock_movements: es una CONFIRMACION o
--    correccion de conteo hecha en el repaso. 'Queda' escribe delta 0 (solo
--    reinicia el reloj del producto); 'No queda'/'Poco'/'Contar' escriben el
--    delta que lleva el stock al valor real. adjust_stock lo acepta.
-- 2) El motor de consumo (avg_daily_consumption en product_replenishment y
--    consumption_stats en product_suggestions) contaba CUALQUIER baja que no
--    fuera compra, incluidas correcciones manuales y descartes por
--    vencimiento (33 bajas de manual_adjust hoy). Un repaso que escribe
--    bajas grandes ('No queda') lo habria contaminado. Ahora cuenta SOLO
--    reason='consumption'. Costo conocido: se pierde la evidencia de las
--    bajas 'manual_adjust' anteriores al 25/9 (cuando el boton "-" todavia
--    no se etiquetaba como consumo); la prediccion vuelve a juntarse con el
--    uso.
-- 3) Vista product_stock_review: que productos tienen el stock dudoso (pasaron
--    su ciclo sin una compra ni un conteo que lo confirme). El ciclo
--    efectivo es la mediana real de compras si hay 3+ intervalos (>= 1 dia,
--    ultimos 180), y si no, el ciclo declarado. La ancla de confirmacion es
--    la ultima compra o conteo; si no hay ninguna, la carga inicial. No
--    escribe nada ni genera sugeridos: solo alimenta la pantalla de repaso.
alter table stock_movements drop constraint stock_movements_reason_check;
alter table stock_movements add constraint stock_movements_reason_check
  check (reason in ('purchase', 'consumption', 'manual_adjust', 'expired_discard', 'initial_load', 'count'));

create or replace function adjust_stock(
  p_household_id uuid,
  p_product_id uuid,
  p_delta numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  if not exists (
    select 1 from products where id = p_product_id and household_id = p_household_id
  ) then
    raise exception 'el producto no pertenece a este hogar';
  end if;

  if p_reason not in ('manual_adjust', 'expired_discard', 'consumption', 'count') then
    raise exception 'reason invalido: %', p_reason;
  end if;

  insert into stock_movements (household_id, product_id, delta, reason, created_by)
  values (p_household_id, p_product_id, p_delta, p_reason, auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

-- Consumo = solo reason='consumption' (ver punto 2).
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
      and snooze.dismissed_until is null then true
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      and snooze.dismissed_until is null then true
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 0
      and (n.purchase_count >= 2 or coalesce(ps.quantity_on_hand, 0) <= 1)
      and snooze.dismissed_until is null then true
    else false
  end as should_restock,
  case
    when p.needs_restock then 'marcado_manual'
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      and snooze.dismissed_until is null then 'prediccion'
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      and snooze.dismissed_until is null then 'umbral_manual'
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 0
      and (n.purchase_count >= 2 or coalesce(ps.quantity_on_hand, 0) <= 1)
      and snooze.dismissed_until is null then 'ciclo_de_compra'
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
        when p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 0 then 'vencido'
        when p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 6 then 'esta_semana'
        when p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 13 then 'proxima_semana'
        else null
      end
    else null
  end as cycle_urgency,
  snooze.dismissed_until as restock_snoozed_until
from products p
left join product_stock ps on ps.product_id = p.id and ps.household_id = p.household_id
left join lateral (
  select
    case
      when count(*) filter (where sm.delta < 0 and sm.reason = 'consumption') >= 2
        and extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason = 'consumption')) >= 3
      then coalesce(sum(-sm.delta) filter (where sm.delta < 0 and sm.reason = 'consumption'), 0)
        / greatest(3, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason = 'consumption'))))
      else null
    end as avg_daily_consumption
  from stock_movements sm
  where sm.product_id = p.id and sm.household_id = p.household_id
    and sm.created_at >= now() - interval '90 days'
) calc on true
left join lateral (
  select max(sm2.created_at) as last_restocked_at
  from stock_movements sm2
  where sm2.product_id = p.id and sm2.household_id = p.household_id and sm2.reason = 'purchase'
) last_restock on true
left join lateral (
  select count(*) as purchase_count
  from stock_movements sm3
  where sm3.product_id = p.id and sm3.household_id = p.household_id and sm3.reason = 'purchase'
) n on true
left join lateral (
  select d.dismissed_until
  from product_suggestion_dismissals d
  where d.product_id = p.id and d.suggestion_type = 'reposicion_pospuesta' and d.dismissed_until > now()
) snooze on true
where p.archived = false;

create or replace view product_suggestions
  with (security_invoker = true)
as
with restock_events as (
  select sm.product_id, sm.household_id, sm.created_at,
    lag(sm.created_at) over (partition by sm.product_id order by sm.created_at) as prev_restocked_at
  from stock_movements sm
  where sm.reason = 'purchase'
),
restock_intervals as (
  select product_id, household_id,
    extract(epoch from created_at - prev_restocked_at) / 86400 as interval_days
  from restock_events
  where prev_restocked_at is not null
    and prev_restocked_at >= now() - interval '180 days'
    and created_at >= now() - interval '180 days'
),
cycle_stats as (
  select product_id, household_id,
    count(*)::int as interval_count,
    percentile_cont(0.5) within group (order by interval_days) as median_interval_days
  from restock_intervals
  group by product_id, household_id
  having count(*) >= 3
),
consumption_stats as (
  select sm.product_id, sm.household_id,
    count(*) filter (where sm.delta < 0 and sm.reason = 'consumption')::int as consumption_events,
    case
      when count(*) filter (where sm.delta < 0 and sm.reason = 'consumption') >= 2
        and extract(day from max(sm.created_at) filter (where sm.delta < 0 and sm.reason = 'consumption') - min(sm.created_at) filter (where sm.delta < 0 and sm.reason = 'consumption')) >= 3
      then coalesce(sum(-sm.delta) filter (where sm.delta < 0 and sm.reason = 'consumption'), 0)
        / greatest(1, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason = 'consumption'))))
      else null
    end as avg_daily_consumption
  from stock_movements sm
  where sm.created_at >= now() - interval '90 days'
  group by sm.product_id, sm.household_id
),
last_restock as (
  select product_id, household_id, max(created_at) as last_restocked_at
  from stock_movements
  where reason = 'purchase'
  group by product_id, household_id
)
select
  p.id as product_id, p.household_id, p.name,
  'ciclo_de_compra' as suggestion_type,
  p.restock_cycle_days::numeric as current_value,
  round(cs.median_interval_days)::numeric as suggested_value,
  cs.interval_count as evidence_count,
  format('En los últimos %s ciclos reales, la mediana fue %s días entre compras.', cs.interval_count, round(cs.median_interval_days)) as reason
from products p
join cycle_stats cs on cs.product_id = p.id and cs.household_id = p.household_id
where p.archived = false
  and round(cs.median_interval_days) >= 1
  and (p.restock_cycle_days is null or abs(cs.median_interval_days - p.restock_cycle_days) >= greatest(3, p.restock_cycle_days * 0.3))
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'ciclo_de_compra'
      and d.dismissed_value = round(cs.median_interval_days)::numeric
  )
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'reposicion_pospuesta'
      and d.dismissed_until > now()
  )
union all
select
  p.id as product_id, p.household_id, p.name,
  'umbral_manual' as suggestion_type,
  p.low_stock_threshold as current_value,
  ceil(co.avg_daily_consumption * 3) as suggested_value,
  co.consumption_events as evidence_count,
  format('Se consume ~%s %s por día. Con umbral en %s vas a llegar justo sin depender de que se registre cada consumo.', round(co.avg_daily_consumption, 2), p.unit_label, ceil(co.avg_daily_consumption * 3)::int) as reason
from products p
join consumption_stats co on co.product_id = p.id and co.household_id = p.household_id
where p.archived = false
  and co.avg_daily_consumption is not null
  and ceil(co.avg_daily_consumption * 3) >= 1
  and (p.low_stock_threshold is null or abs(p.low_stock_threshold - ceil(co.avg_daily_consumption * 3)) >= greatest(1, ceil(co.avg_daily_consumption * 3) * 0.2))
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'umbral_manual'
      and d.dismissed_value = ceil(co.avg_daily_consumption * 3)
  )
union all
select
  p.id as product_id, p.household_id, p.name,
  'archivar' as suggestion_type,
  null::numeric as current_value,
  null::numeric as suggested_value,
  0 as evidence_count,
  case
    when lr.last_restocked_at is not null
      then format('Hace %s días que no entra a la casa y no queda stock.', extract(day from now() - lr.last_restocked_at)::int)
    else format('Está en el catálogo hace más de %s días y nunca se compró.', extract(day from now() - p.created_at)::int)
  end as reason
from products p
left join last_restock lr on lr.product_id = p.id and lr.household_id = p.household_id
left join product_stock ps on ps.product_id = p.id and ps.household_id = p.household_id
where p.archived = false
  and coalesce(ps.quantity_on_hand, 0) <= 0
  and (
    (lr.last_restocked_at is not null and now() - lr.last_restocked_at >= interval '120 days')
    or (lr.last_restocked_at is null and now() - p.created_at >= interval '60 days')
  )
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'archivar'
      and d.dismissed_at > coalesce(lr.last_restocked_at, p.created_at)
  );

create or replace view product_stock_review
  with (security_invoker = true)
as
with purchase_events as (
  select sm.product_id, sm.household_id, sm.created_at,
    lag(sm.created_at) over (partition by sm.product_id order by sm.created_at) as prev_at
  from stock_movements sm
  where sm.reason = 'purchase'
),
learned as (
  select product_id, household_id,
    count(*)::int as n_intervals,
    percentile_cont(0.5) within group (
      order by (extract(epoch from created_at - prev_at) / 86400)::double precision
    ) as median_days
  from purchase_events
  where prev_at is not null
    and created_at >= now() - interval '180 days'
    and created_at - prev_at >= interval '1 day'
  group by product_id, household_id
),
anchors as (
  select product_id, household_id,
    max(created_at) filter (where reason in ('purchase', 'count')) as confirmed_at,
    max(created_at) filter (where reason = 'initial_load') as initial_at
  from stock_movements
  group by product_id, household_id
),
base as (
  select
    p.id as product_id,
    p.household_id,
    p.name,
    p.unit_label,
    coalesce(ps.quantity_on_hand, 0) as quantity_on_hand,
    p.restock_cycle_days,
    case when l.n_intervals >= 3 and l.median_days >= 1
      then round(l.median_days)::int else p.restock_cycle_days end as effective_cycle_days,
    case when l.n_intervals >= 3 and l.median_days >= 1
      then 'aprendido' else 'declarado' end as cycle_source,
    coalesce(a.confirmed_at, a.initial_at, p.created_at) as anchor_at
  from products p
  left join product_stock ps on ps.product_id = p.id and ps.household_id = p.household_id
  left join learned l on l.product_id = p.id and l.household_id = p.household_id
  left join anchors a on a.product_id = p.id and a.household_id = p.household_id
  where p.archived = false
)
select
  b.product_id,
  b.household_id,
  b.name,
  b.unit_label,
  b.quantity_on_hand,
  b.restock_cycle_days,
  b.effective_cycle_days,
  b.cycle_source,
  b.anchor_at,
  extract(day from now() - b.anchor_at)::int as days_since_confirmed,
  case when b.effective_cycle_days > 0
    then round((extract(epoch from now() - b.anchor_at) / 86400 / b.effective_cycle_days)::numeric, 2)
  end as overdue_ratio,
  (
    b.restock_cycle_days is not null
    and b.effective_cycle_days > 0
    and b.quantity_on_hand > 0
    and extract(day from now() - b.anchor_at) >= b.effective_cycle_days
  ) as needs_review
from base b;
