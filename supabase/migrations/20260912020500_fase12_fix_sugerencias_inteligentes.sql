-- Correcciones a Fase 10/11 (product_suggestions) encontradas en una
-- revisión con rol de ingeniería de datos + seguridad antes de dar la
-- feature por cerrada. Dos bugs reales de lógica, confirmados con casos
-- concretos (no hipotéticos):
--
-- 1) ciclo_de_compra: la ventana de "últimos 180 días" solo se aplicaba
--    al extremo más nuevo del intervalo (`created_at`), no al más viejo
--    (`prev_restocked_at`) -- un hueco de 300 días podía colarse como un
--    "intervalo real" si el evento más reciente caía dentro de los 180
--    días. Además `delta > 0` sin filtrar `reason` contaba también el
--    `initial_load` de Fase 6 (una unidad sintética el día de alta del
--    hogar, no una compra real) y cualquier `manual_adjust` positivo
--    como si fueran compras -- eso ancla artificialmente un intervalo al
--    día de alta del hogar en vez de al comportamiento real de recompra.
--    Se corrige filtrando `reason = 'purchase'` (compras reales
--    únicamente) desde el CTE base, así los dos problemas se resuelven
--    juntos: ya no hay evento sintético que anclar, y la ventana de 180
--    días queda automáticamente aplicada a ambos extremos de cada
--    intervalo. Se cambia también `avg` por `percentile_cont(0.5)`
--    (mediana): con apenas 2-3 intervalos, un solo outlier (ej. una
--    compra atrasada por vacaciones) no debería arrastrar el promedio.
--
-- 2) umbral_manual: el piso de "al menos 2 bajas de stock" no exige
--    ninguna dispersión temporal -- dos consumos registrados el mismo
--    día (`greatest(1, dias)` en el denominador) inflan la tasa diaria
--    estimada y, a diferencia de product_replenishment (Fase 4/8, donde
--    esta misma fórmula ya existía pero solo alimentaba un flag
--    efímero), acá el resultado se ESCRIBE en `products.low_stock_threshold`
--    si se acepta la sugerencia -- un umbral inflado por un caso de borde
--    persiste hasta que alguien lo corrija a mano. Se agrega una exigencia
--    de dispersión mínima (los consumos tienen que abarcar al menos 3
--    días distintos) antes de confiar en la tasa para sugerir un umbral.
--
-- Se ajusta también el umbral de "cuándo insistir de nuevo" en
-- umbral_manual (de una diferencia absoluta de 1 a un 20%, mínimo 1) para
-- no re-sugerir ante una diferencia de redondeo de una sola unidad, en
-- línea con el mismo criterio (variación relativa) que ya usa
-- ciclo_de_compra.

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
  where sm.delta > 0
    and sm.reason = 'purchase'
),
restock_intervals as (
  select
    product_id,
    household_id,
    extract(epoch from (created_at - prev_restocked_at)) / 86400 as interval_days
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
  having count(*) >= 2
),
consumption_stats as (
  select
    sm.product_id,
    sm.household_id,
    count(*) filter (where sm.delta < 0)::int as consumption_events,
    case
      when count(*) filter (where sm.delta < 0) >= 2
        and extract(day from max(sm.created_at) filter (where sm.delta < 0) - min(sm.created_at) filter (where sm.delta < 0)) >= 3
      then
        coalesce(sum(-sm.delta) filter (where sm.delta < 0), 0)
        / greatest(1, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0))))
      else null
    end as avg_daily_consumption
  from stock_movements sm
  where sm.created_at >= now() - interval '90 days'
  group by sm.product_id, sm.household_id
),
last_restock as (
  select product_id, household_id, max(created_at) as last_restocked_at
  from stock_movements
  where delta > 0
  group by product_id, household_id
)
select
  p.id as product_id,
  p.household_id,
  p.name,
  'ciclo_de_compra'::text as suggestion_type,
  p.restock_cycle_days::numeric as current_value,
  round(cs.median_interval_days)::numeric as suggested_value,
  cs.interval_count as evidence_count,
  format(
    'En los últimos %s ciclos reales, la mediana fue %s días entre compras.',
    cs.interval_count, round(cs.median_interval_days)
  ) as reason
from products p
join cycle_stats cs on cs.product_id = p.id and cs.household_id = p.household_id
where p.archived = false
  and round(cs.median_interval_days) >= 1
  and (
    p.restock_cycle_days is null
    or abs(cs.median_interval_days - p.restock_cycle_days) >= greatest(3, p.restock_cycle_days * 0.3)
  )
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'ciclo_de_compra'
      and d.dismissed_value = round(cs.median_interval_days)::numeric
  )

union all

select
  p.id,
  p.household_id,
  p.name,
  'umbral_manual'::text,
  p.low_stock_threshold::numeric,
  ceil(co.avg_daily_consumption * 3)::numeric,
  co.consumption_events,
  format(
    'Se consume ~%s %s por día. Con umbral en %s vas a llegar justo sin depender de que se registre cada consumo.',
    round(co.avg_daily_consumption::numeric, 2), p.unit_label, ceil(co.avg_daily_consumption * 3)::int
  )
from products p
join consumption_stats co on co.product_id = p.id and co.household_id = p.household_id
where p.archived = false
  and co.avg_daily_consumption is not null
  and ceil(co.avg_daily_consumption * 3) >= 1
  and (
    p.low_stock_threshold is null
    or abs(p.low_stock_threshold - ceil(co.avg_daily_consumption * 3)) >= greatest(1, ceil(co.avg_daily_consumption * 3) * 0.2)
  )
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'umbral_manual'
      and d.dismissed_value = ceil(co.avg_daily_consumption * 3)::numeric
  )

union all

select
  p.id,
  p.household_id,
  p.name,
  'archivar'::text,
  null::numeric,
  null::numeric,
  0,
  case
    when lr.last_restocked_at is not null then
      format('Hace %s días que no entra a la casa y no queda stock.', extract(day from now() - lr.last_restocked_at)::int)
    else
      format('Está en el catálogo hace más de %s días y nunca se compró.', extract(day from now() - p.created_at)::int)
  end
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

-- Limpieza menor: el índice individual en product_id era redundante con
-- el índice implícito de la unique constraint (product_id, suggestion_type)
-- -- Postgres ya puede usar ese índice para filtros por product_id solo,
-- al ser la columna líder.
drop index if exists product_suggestion_dismissals_product_id_idx;

-- Defensa en profundidad en la policy de dismissals: aunque hoy el único
-- camino de escritura es el RPC dismiss_product_suggestion (que ya
-- resuelve household_id a partir del producto), la policy en sí no
-- impedía insertar una fila con un product_id de OTRO hogar mientras el
-- household_id coincidiera con el propio -- inofensivo en la práctica
-- (la vista igual la ignoraría, nunca hace match), pero mismo patrón de
-- "exists" que ya usan otras policies de esta app para tablas cuyo scope
-- de hogar depende de otra tabla (ver shopping_list_items).
drop policy "members can manage dismissals" on product_suggestion_dismissals;
create policy "members can manage dismissals" on product_suggestion_dismissals for all
  using (private.is_household_member(household_id))
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1 from products p
      where p.id = product_suggestion_dismissals.product_id
        and p.household_id = product_suggestion_dismissals.household_id
    )
  );
