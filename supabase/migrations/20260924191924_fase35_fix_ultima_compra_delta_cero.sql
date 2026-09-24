-- Fase 35: bug real reportado por el usuario -- "Pizza Sibarita" mostraba
-- "hace 12 días que no lo comprás" cuando la última compra fue el 21/9
-- (hace 3 días). Causa confirmada contra la fila real:
--
--   2026-09-12  delta=1  reason=purchase
--   2026-09-21  delta=0  reason=purchase   <- compra real con "Reemplaza
--                                             el stock" (Fase 26): ya había
--                                             1 unidad registrada, compró 1,
--                                             delta = 1 - 1 = 0
--
-- product_replenishment y product_suggestions calculaban "última compra"
-- como max(created_at) WHERE delta > 0 -- una compra real cuyo delta da 0
-- (o negativo, si "reemplazar" corrige el conteo hacia abajo) queda
-- invisible para esa lógica, aunque esté perfectamente registrada en
-- Historial con reason='purchase'. La vista entonces sigue mirando la
-- compra anterior (12/9), de ahí los "12 días" en vez de los 3 reales.
--
-- Fix: "hubo una compra" se define por reason='purchase', no por el signo
-- del delta resultante. Se aplica en los 3 lugares que usaban ese filtro:
--
-- 1) product_replenishment.last_restock -- causa directa del bug reportado.
-- 2) product_suggestions.last_restock (rama 'archivar') -- mismo bug podía
--    hacer que un producto que sí se sigue comprando pareciera "abandonado".
-- 3) product_suggestions.restock_events (rama 'ciclo_de_compra') -- ya
--    filtraba reason='purchase', pero el AND delta>0 seguía excluyendo
--    compras reales con "reemplazar" de la evidencia de ciclo.
--
-- Bonus, mismo root cause en la otra dirección: una compra "reemplazar
-- stock" con delta NEGATIVO (corrige el conteo hacia abajo) es una
-- corrección de inventario, no consumo real -- pero avg_daily_consumption
-- (product_replenishment.calc y product_suggestions.consumption_stats)
-- contaba CUALQUIER delta negativo como consumo, sin mirar el motivo. Se
-- excluye reason='purchase' de esa cuenta en ambos lugares (no se toca
-- manual_adjust: hoy la UI de Stock no distingue "consumí esto" de
-- "corregí un conteo", ambos casos comparten ese reason -- limitación de
-- diseño conocida, no de esta migración).
--
-- Alcance real confirmado contra datos reales: 16 compras (12 productos)
-- de las últimas dos semanas tenían delta<=0 y quedaban invisibles antes
-- de este fix -- no era un caso aislado, era la mayoría de las compras
-- registradas con "Reemplaza el stock".
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
      when count(*) filter (where sm.delta < 0 and sm.reason <> 'purchase') >= 2
        and extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason <> 'purchase')) >= 3
      then
        coalesce(sum(-sm.delta) filter (where sm.delta < 0 and sm.reason <> 'purchase'), 0)
        / greatest(3, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason <> 'purchase'))))
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
    and sm2.reason = 'purchase'
) last_restock on true
left join lateral (
  select d.dismissed_until
  from product_suggestion_dismissals d
  where d.product_id = p.id
    and d.suggestion_type = 'reposicion_pospuesta'
    and d.dismissed_until > now()
) snooze on true
where p.archived = false;

create or replace view product_suggestions
  with (security_invoker = true)
as
with restock_events as (
  select
    sm.product_id,
    sm.household_id,
    sm.created_at,
    lag(sm.created_at) over (partition by sm.product_id order by sm.created_at) as prev_restocked_at
  from stock_movements sm
  where sm.reason = 'purchase'
),
restock_intervals as (
  select
    product_id,
    household_id,
    extract(epoch from created_at - prev_restocked_at) / 86400 as interval_days
  from restock_events
  where prev_restocked_at is not null
    and prev_restocked_at >= now() - interval '180 days'
    and created_at >= now() - interval '180 days'
),
cycle_stats as (
  select
    product_id,
    household_id,
    count(*)::int as interval_count,
    percentile_cont(0.5) within group (order by interval_days) as median_interval_days
  from restock_intervals
  group by product_id, household_id
  having count(*) >= 3
),
consumption_stats as (
  select
    sm.product_id,
    sm.household_id,
    count(*) filter (where sm.delta < 0 and sm.reason <> 'purchase')::int as consumption_events,
    case
      when count(*) filter (where sm.delta < 0 and sm.reason <> 'purchase') >= 2
        and extract(day from max(sm.created_at) filter (where sm.delta < 0 and sm.reason <> 'purchase') - min(sm.created_at) filter (where sm.delta < 0 and sm.reason <> 'purchase')) >= 3
      then coalesce(sum(-sm.delta) filter (where sm.delta < 0 and sm.reason <> 'purchase'), 0)
        / greatest(1, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason <> 'purchase'))))
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
  p.id as product_id,
  p.household_id,
  p.name,
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
  p.id as product_id,
  p.household_id,
  p.name,
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
  p.id as product_id,
  p.household_id,
  p.name,
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
