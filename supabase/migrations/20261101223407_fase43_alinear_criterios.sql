-- Fase 43: alinear los criterios del motor (/consejo, auditoria de las Fases 38-42).
--
-- 1) UN SOLO "poco stock". La pestana Stock marcaba "Bajo stock" a 24
--    productos por ciclo (vencido o esta semana) mientras los sugeridos de
--    Lista/Comprar eran 2. La app ahora usa la regla de product_replenishment
--    (should_restock) en todos lados; la parte de ciclo ya no mira solo la
--    ultima compra sino la ultima CONFIRMACION (compra o conteo del repaso):
--    si en el repaso dijiste "Queda", el producto deja de figurar vencido.
--    cycle_urgency (vencido / esta semana / proxima) usa la misma ancla.
--    days_since_last_restock sigue siendo la ultima compra (es el dato del
--    texto "hace X dias que no lo compras").
-- 2) UN SOLO CICLO. El repaso usaba el ciclo "aprendido" (mediana real) y los
--    sugeridos el declarado; difirian en 6 productos. Ahora el repaso usa el
--    declarado: es el que controla la persona y el que el modulo de
--    Sugerencias propone corregir cuando el real se aleja (>= 30% y 3 dias).
-- 3) ORDEN DEL REPASO. Antes por "veces vencido" (dias/ciclo): ponia primero
--    a los nunca comprados con ciclo corto (Capelettis, 7 dias, 7,2x). Ahora
--    primero lo comprado de verdad (has_purchase) y, dentro de eso, mas dias
--    de atraso (days_overdue). Lo que solo tiene la carga inicial va al final.
-- 4) PREDICCION. En la Fase 40 el consumo paso a contar solo reason =
--    'consumption' (15 eventos) y la prediccion "se esta por acabar" quedo
--    casi apagada. Verificado en la base: las 33 bajas 'manual_adjust' son
--    TODAS anteriores al 24/9 20:00 UTC (cuando el boton "-" empezo a
--    etiquetarse 'consumption'; hasta entonces era la unica forma de bajar
--    el stock) y no hay ninguna posterior; las 15 'consumption' son todas
--    posteriores. is_consumption_event() cuenta ambas y deja afuera las
--    correcciones modernas (repaso 'count', ediciones, descartes).
create or replace function is_consumption_event(
  p_reason text,
  p_delta numeric,
  p_created_at timestamptz
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_delta < 0 and (
    p_reason = 'consumption'
    or (p_reason = 'manual_adjust' and p_created_at < timestamptz '2026-09-24 20:00:00+00')
  )
$$;

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
      and p.restock_cycle_days - extract(day from now() - conf.confirmed_at)::int <= 0
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
      and p.restock_cycle_days - extract(day from now() - conf.confirmed_at)::int <= 0
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
        when p.restock_cycle_days - extract(day from now() - conf.confirmed_at)::int <= 0 then 'vencido'
        when p.restock_cycle_days - extract(day from now() - conf.confirmed_at)::int <= 6 then 'esta_semana'
        when p.restock_cycle_days - extract(day from now() - conf.confirmed_at)::int <= 13 then 'proxima_semana'
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
      when count(*) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at)) >= 2
        and extract(day from now() - min(sm.created_at) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at))) >= 3
      then coalesce(sum(-sm.delta) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at)), 0)
        / greatest(3, least(90, extract(day from now() - min(sm.created_at) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at)))))
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
  select max(sm4.created_at) as confirmed_at
  from stock_movements sm4
  where sm4.product_id = p.id and sm4.household_id = p.household_id
    and sm4.reason in ('purchase', 'count')
) conf on true
left join lateral (
  select d.dismissed_until
  from product_suggestion_dismissals d
  where d.product_id = p.id and d.suggestion_type = 'reposicion_pospuesta' and d.dismissed_until > now()
) snooze on true
where p.archived = false;

create or replace view product_suggestions
  with (security_invoker = true)
as
with mv as (
  select sm.id, sm.product_id, sm.household_id, sm.reason, sm.created_at,
    sum(sm.delta) over (partition by sm.product_id order by sm.created_at, sm.id) as qty_after
  from stock_movements sm
),
restock_events as (
  select sm.product_id, sm.household_id, sm.created_at,
    lag(sm.created_at) over (partition by sm.product_id order by sm.created_at) as prev_restocked_at
  from stock_movements sm
  where sm.reason = 'purchase'
),
count_windows as (
  select c.product_id, c.household_id, c.created_at as counted_at, c.qty_after as q_end,
    p.created_at as purchase_at, p.qty_after as q_start,
    row_number() over (partition by c.product_id, p.id order by c.created_at desc, c.id desc) as rn
  from mv c
  cross join lateral (
    select pm.id, pm.created_at, pm.qty_after
    from mv pm
    where pm.product_id = c.product_id and pm.reason = 'purchase' and pm.created_at < c.created_at
    order by pm.created_at desc, pm.id desc
    limit 1
  ) p
  where c.reason = 'count'
    and c.created_at >= now() - interval '180 days'
),
count_samples as (
  select w.product_id, w.household_id, w.purchase_at,
    extract(epoch from w.counted_at - w.purchase_at) / 86400 as d,
    w.q_start, w.q_end
  from count_windows w
  where w.rn = 1
    and w.counted_at - w.purchase_at >= interval '1 day'
    and w.q_start > 0
),
cycle_samples as (
  select re.product_id, re.household_id,
    (extract(epoch from re.created_at - re.prev_restocked_at) / 86400)::double precision as days,
    false as from_count,
    false as is_bound
  from restock_events re
  where re.prev_restocked_at is not null
    and re.prev_restocked_at >= now() - interval '180 days'
    and re.created_at >= now() - interval '180 days'
    and not exists (
      select 1 from count_samples cs
      where cs.product_id = re.product_id and cs.purchase_at = re.prev_restocked_at
    )
  union all
  select cs.product_id, cs.household_id,
    least(
      case
        when cs.q_end > 0 and cs.q_end < cs.q_start then cs.d * cs.q_start / (cs.q_start - cs.q_end)
        else cs.d
      end,
      365
    )::double precision as days,
    true as from_count,
    (cs.q_end >= cs.q_start) as is_bound
  from count_samples cs
  join products p on p.id = cs.product_id
  where not (cs.q_end <= 0 and p.restock_cycle_days is not null and cs.d > 1.5 * p.restock_cycle_days)
),
cycle_agg as (
  select product_id, household_id,
    count(*) filter (where not is_bound)::int as n_exact,
    count(*) filter (where not is_bound and from_count)::int as n_exact_counts,
    percentile_cont(0.5) within group (order by days) filter (where not is_bound) as median_exact,
    max(days) filter (where is_bound) as max_bound
  from cycle_samples
  group by product_id, household_id
),
cycle_stats as (
  select a.product_id, a.household_id,
    a.n_exact, a.n_exact_counts,
    (a.max_bound is not null and (a.median_exact is null or a.max_bound > a.median_exact)) as bound_driven,
    greatest(coalesce(a.median_exact, 0), coalesce(a.max_bound, 0)) as median_interval_days
  from cycle_agg a
),
cycle_eval as (
  select cs.*,
    cs.n_exact + (case when cs.bound_driven then 1 else 0 end) as interval_count
  from cycle_stats cs
),
consumption_stats as (
  select sm.product_id, sm.household_id,
    count(*) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at))::int as consumption_events,
    case
      when count(*) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at)) >= 2
        and extract(day from max(sm.created_at) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at)) - min(sm.created_at) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at))) >= 3
      then coalesce(sum(-sm.delta) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at)), 0)
        / greatest(1, least(90, extract(day from now() - min(sm.created_at) filter (where is_consumption_event(sm.reason, sm.delta, sm.created_at)))))
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
  case
    when cs.bound_driven then
      format('Cuando lo revisaste, a los %s días todavía quedaba stock: el ciclo es de al menos %s días.', round(cs.median_interval_days), round(cs.median_interval_days))
    when cs.n_exact_counts = 0 then
      format('En los últimos %s ciclos reales, la mediana fue %s días entre compras.', cs.interval_count, round(cs.median_interval_days))
    when cs.n_exact = cs.n_exact_counts then
      format('Según %s %s de stock, el ciclo típico es de %s días.', cs.n_exact_counts, case when cs.n_exact_counts = 1 then 'repaso' else 'repasos' end, round(cs.median_interval_days))
    else
      format('Entre %s ciclos de compra y %s %s de stock, el ciclo típico es de %s días.', cs.n_exact - cs.n_exact_counts, cs.n_exact_counts, case when cs.n_exact_counts = 1 then 'repaso' else 'repasos' end, round(cs.median_interval_days))
  end as reason
from products p
join cycle_eval cs on cs.product_id = p.id and cs.household_id = p.household_id
where p.archived = false
  and (cs.interval_count >= 3 or (cs.interval_count >= 2 and (cs.n_exact_counts >= 1 or cs.bound_driven)))
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

-- Vista del repaso: CREATE OR REPLACE (sin DROP) conservando las columnas que ya
-- tenia, en el mismo orden; effective_cycle_days y cycle_source quedan fijos en
-- el ciclo declarado (columnas sin uso que se pueden limpiar mas adelante) y las
-- dos nuevas, has_purchase y days_overdue, van al final.
create or replace view product_stock_review
  with (security_invoker = true)
as
with anchors as (
  select product_id, household_id,
    max(created_at) filter (where reason in ('purchase', 'count')) as confirmed_at,
    max(created_at) filter (where reason = 'purchase') as purchased_at,
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
    coalesce(a.confirmed_at, a.initial_at, p.created_at) as anchor_at,
    (a.purchased_at is not null) as has_purchase
  from products p
  left join product_stock ps on ps.product_id = p.id and ps.household_id = p.household_id
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
  b.restock_cycle_days as effective_cycle_days,
  'declarado'::text as cycle_source,
  b.anchor_at,
  extract(day from now() - b.anchor_at)::int as days_since_confirmed,
  case when b.restock_cycle_days > 0
    then round((extract(epoch from now() - b.anchor_at) / 86400 / b.restock_cycle_days)::numeric, 2)
  end as overdue_ratio,
  (
    b.restock_cycle_days is not null
    and b.restock_cycle_days > 0
    and b.quantity_on_hand > 0
    and extract(day from now() - b.anchor_at) >= b.restock_cycle_days
  ) as needs_review,
  b.has_purchase,
  greatest(0, extract(day from now() - b.anchor_at)::int - coalesce(b.restock_cycle_days, 0)) as days_overdue
from base b;
