-- Fase 34: revisión del motor de sugerencias (/consejo, rol ML/Estadística)
-- + alertas de "sugerencia sin leer" por usuario.
--
-- Dos cambios al motor, ambos preventivos (no correctivos -- se verificó
-- que hoy no hay evidencia real todavía en ningún producto, así que no
-- cambian nada visible hoy, solo mejoran el comportamiento a futuro):
--
-- 1) La mediana de ciclo real exigía apenas 2 intervalos (3 compras) para
--    sugerir recalibrar restock_cycle_days -- la mediana de 2 valores es
--    prácticamente el promedio de esos 2, muy poca evidencia para una
--    sugerencia con tono de certeza. Se sube el piso a 3 intervalos (4
--    compras).
-- 2) Inconsistencia real entre dos sistemas: "posponer" (Fase 30/31) le
--    dice a la persona "dejo de insistir con este producto irregular",
--    pero product_suggestions seguía proponiendo "recalibrá el ciclo" del
--    mismo producto con la misma data irregular -- contradictorio. Se
--    excluye de la sugerencia 'ciclo_de_compra' a los productos con un
--    posponer vigente (mismo criterio que ya usa product_replenishment).
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
  where sm.delta > 0 and sm.reason = 'purchase'
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
  having count(*) >= 3 -- antes >= 2 (Fase 34: piso de evidencia más alto)
),
consumption_stats as (
  select
    sm.product_id,
    sm.household_id,
    count(*) filter (where sm.delta < 0)::int as consumption_events,
    case
      when count(*) filter (where sm.delta < 0) >= 2
        and extract(day from max(sm.created_at) filter (where sm.delta < 0) - min(sm.created_at) filter (where sm.delta < 0)) >= 3
      then coalesce(sum(-sm.delta) filter (where sm.delta < 0), 0)
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
  -- Fase 34: no recalibrar el ciclo de un producto que la persona pidió
  -- explícitamente no seguir empujando por un tiempo.
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

-- Alertas "sin leer" por usuario (segunda parte del pedido): cada persona
-- del hogar marca por su cuenta qué sugerencias ya vio -- no es una
-- marca de "descartada" (eso ya existe, product_suggestion_dismissals,
-- household-wide), es personal: si Coti ya abrió la pestaña pero Rami no,
-- Rami debería seguir viendo la alerta. La identidad de una sugerencia es
-- product_id + suggestion_type + suggested_value (si el valor sugerido
-- cambia, es una sugerencia distinta aunque sea el mismo producto/tipo);
-- 'archivar' no tiene valor propio, así que usa -1 como valor "no
-- aplica" en vez de NULL (evita duplicar filas al no poder hacer upsert
-- limpio sobre una columna nullable en la clave).
create table suggestion_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  suggestion_type text not null,
  suggested_value numeric not null default -1,
  seen_at timestamptz not null default now(),
  primary key (user_id, product_id, suggestion_type, suggested_value)
);

alter table suggestion_seen enable row level security;

create policy "cada usuario ve y marca sus propios vistos"
on suggestion_seen for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and private.is_household_member(household_id));

-- Marca TODAS las sugerencias actualmente visibles como vistas por quien
-- llama -- se invoca al abrir la pestaña Sugerencias, mismo criterio que
-- "abriste la bandeja, se marca como leído" (no hace falta granularidad
-- por tarjeta para un hogar de 1-2 personas).
create or replace function mark_suggestions_seen(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not authorized';
  end if;

  insert into suggestion_seen (user_id, household_id, product_id, suggestion_type, suggested_value)
  select auth.uid(), p_household_id, s.product_id, s.suggestion_type, coalesce(s.suggested_value, -1)
  from product_suggestions s
  where s.household_id = p_household_id
  on conflict (user_id, product_id, suggestion_type, suggested_value)
  do update set seen_at = now();
end;
$function$;
