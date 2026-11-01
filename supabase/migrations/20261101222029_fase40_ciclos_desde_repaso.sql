-- Fase 42: las respuestas del repaso alimentan el módulo de Sugerencias.
--
-- Se revisó el módulo existente (vista product_suggestions -> panel en
-- Reportes -> apply/dismiss_product_suggestion -> aviso de "sin leer") y ya
-- hace exactamente "proponer alargar o acortar un ciclo"; construir otro
-- mecanismo paralelo duplicaria todo eso. Su limite era la EVIDENCIA: el
-- ciclo se inferia solo de intervalos entre compras y exigia 3 intervalos
-- (4 compras). Medido: solo 11 de 75 productos con ciclo llegan a 4 compras,
-- los otros 64 nunca podrian recibir una sugerencia.
--
-- Cada conteo del repaso es una medicion directa de cuanto dura el producto:
--   ventana = desde la ultima COMPRA hasta el conteo (la carga inicial no
--   cuenta: su cantidad es una estimacion, no una compra real);
--   d = dias de la ventana; q_start = stock justo despues de la compra;
--   q_end = stock despues del conteo.
--   * quedaba menos que al comprar (0 < q_end < q_start): consumo lineal,
--     ciclo = d * q_start / (q_start - q_end);
--   * se acabo (q_end = 0): ciclo = d, pero solo si d <= 1.5 x el ciclo
--     cargado (si no, solo sabemos que se acabo en algun momento antes);
--   * no se consumio nada (q_end >= q_start, o sea "Queda"): ciclo >= d. Es
--     solo una COTA INFERIOR: puede alargar un ciclo pero nunca acortarlo, asi
--     que no entra a la mediana; funciona como piso de la sugerencia
--     (suggested = max(mediana de muestras exactas, mayor cota)). El proximo
--     repaso, despues de otro ciclo, la va afinando.
-- Una muestra por ventana (el ultimo conteo). Si una ventana tiene conteo, se
-- usa el conteo en lugar del intervalo de compras de esa misma ventana (no se
-- cuenta dos veces). Umbral de evidencia: 3 muestras como antes, o 2 si al
-- menos una es de un repaso (es una medicion directa, no un habito de compra).
-- Una cota que no supera a la mediana no aporta nada y no cuenta como evidencia.
-- Limitacion conocida: si se hace "Deshacer" de un conteo, el ultimo conteo de
-- la ventana pasa a ser el de la reversion (cuenta como "no se consumio").
-- El panel, aplicar, descartar y sin-leer no cambian: la sugerencia sigue
-- siendo de tipo 'ciclo_de_compra'.
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
