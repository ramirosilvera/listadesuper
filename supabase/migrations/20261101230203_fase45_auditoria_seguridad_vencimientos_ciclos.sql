-- Fase 45: auditoria de las Fases 43-44 (/consejo).
--
-- 1) Seguridad: mark_suggestions_seen, snooze_restock y unsnooze_restock eran
--    ejecutables por el rol anon (el advisor los marcaba). Ya validaban
--    membresia con auth.uid() (que es null sin sesion), asi que no eran
--    explotables, pero no hay motivo para exponerlos: se revoca a public/anon y
--    se concede solo a authenticated, igual que adjust_stock.
-- 2) Rendimiento: indice para la FK stock_zero_movement_id de shopping_list_items.
-- 3) Vencimientos: product_expirations_upcoming mostraba lotes activos de
--    productos con stock 0 (9 casos medidos; 6 tras filtrar archivados). Con la
--    Fase 44 se agrava: agregar a la lista deja el stock en 0 pero los lotes
--    seguian "por vencer". Se ocultan los de productos sin stock. Alternativa
--    mas agresiva evaluada y NO aplicada: cobertura FIFO (ocultar lotes que el
--    stock ya no cubre) esconderia 52 de 198 lotes, 4 de ellos urgentes, apoyada
--    en un stock que sabemos poco confiable.
-- 4) Sugerencias de ciclo: de 11 productos contados en el repaso, 7 tenian el
--    ciclo cargado 2 a 5 veces fuera de lo medido (Coco rallado 14 vs ~66,
--    Desodorante 28 vs ~66, Yerba mate 21 vs ~48, Algodon y Mermelada 14 vs al
--    menos 33) y NINGUNO generaba sugerencia: la regla pedia 2 muestras y con 1
--    sola compra no hay intervalos. Ahora una sola medicion del repaso alcanza si
--    el ciclo cargado esta a >= 2x (o <= la mitad). Una sugerencia es una
--    propuesta que se acepta o se descarta, asi que el costo de un falso
--    positivo es bajo.

revoke execute on function public.mark_suggestions_seen(uuid) from public, anon;
grant execute on function public.mark_suggestions_seen(uuid) to authenticated;
revoke execute on function public.snooze_restock(uuid, integer) from public, anon;
grant execute on function public.snooze_restock(uuid, integer) to authenticated;
revoke execute on function public.unsnooze_restock(uuid) from public, anon;
grant execute on function public.unsnooze_restock(uuid) to authenticated;

create index if not exists shopping_list_items_stock_zero_movement_id_idx
  on public.shopping_list_items (stock_zero_movement_id);

create or replace view product_expirations_upcoming
  with (security_invoker = true)
as
select pe.id,
  pe.household_id,
  pe.product_id,
  p.name as product_name,
  p.unit_label,
  pe.expiration_date,
  pe.quantity,
  pe.expiration_date - current_date as days_until,
  case
    when pe.expiration_date < current_date then 'expired'::text
    when (pe.expiration_date - current_date) <= 2 then 'red'::text
    when (pe.expiration_date - current_date) <= 7 then 'amber'::text
    else 'green'::text
  end as level,
  pe.purchase_item_id,
  pe.confirmed_by_user
from product_expirations pe
join products p on p.id = pe.product_id
left join product_stock ps on ps.product_id = pe.product_id and ps.household_id = pe.household_id
where pe.status = 'active'
  and p.archived = false
  and coalesce(ps.quantity_on_hand, 0) > 0
order by pe.expiration_date;

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
  and (
    cs.interval_count >= 3
    or (cs.interval_count >= 2 and (cs.n_exact_counts >= 1 or cs.bound_driven))
    -- Fase 45: una sola medición directa del repaso alcanza si el ciclo cargado
    -- está muy lejos (>= 2x mas largo o <= la mitad). Con 1 sola compra no hay
    -- intervalos, y 53 de 75 productos con ciclo estan en ese caso: sin esto el
    -- motor quedaba inerte justo donde el ciclo cargado es una estimacion.
    or (
      cs.interval_count = 1
      and (cs.n_exact_counts = 1 or cs.bound_driven)
      and p.restock_cycle_days is not null
      and (cs.median_interval_days >= 2 * p.restock_cycle_days or cs.median_interval_days <= 0.5 * p.restock_cycle_days)
    )
  )
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
  -- Fase 44: un producto que está en la lista activa tiene stock 0 a propósito
  -- (se lo deja así al agregarlo); no es "inactivo", se está por comprar.
  and not exists (
    select 1 from shopping_list_items sli
    join shopping_lists sl on sl.id = sli.list_id
    where sli.product_id = p.id and sl.status = 'active'
  )
  and (
    (lr.last_restocked_at is not null and now() - lr.last_restocked_at >= interval '120 days')
    or (lr.last_restocked_at is null and now() - p.created_at >= interval '60 days')
  )
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'archivar'
      and d.dismissed_at > coalesce(lr.last_restocked_at, p.created_at)
  );
