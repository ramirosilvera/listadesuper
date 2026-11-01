-- Fase 44 (paso 2 de 2): al agregar un producto a la lista, su stock pasa a 0.
--
-- Pedido: "cuando se agregue un producto en la lista de súper, dejarlo sin
-- stock, así no lo cargamos dos veces". Un trigger BEFORE INSERT sobre
-- shopping_list_items (la pantalla Lista es el único lugar que inserta ahí;
-- el formulario de Comprar solo arma filas locales) escribe un movimiento
-- 'list_zero' por -(stock actual) y guarda en el ítem cuánto había
-- (stock_zeroed_qty) y cuál fue el movimiento (stock_zero_movement_id). Si el
-- producto ya estaba en 0 no hace nada. Cubre buscador, producto nuevo y chips
-- de sugeridos, es atómico y sirve para cualquier cliente.
--
-- Salvaguarda: agregar a la lista no siempre significa "se acabó" (puede
-- quedar algo en casa). Un trigger AFTER DELETE restituye lo que había si el
-- ítem se quita de la lista SIN comprarse y nadie tocó el stock después. Una
-- compra (record_purchase inserta su movimiento antes de borrar el ítem), un
-- conteo o un ajuste posterior cuentan como información más nueva: no se
-- restituye nada. Es idempotente (la restitución es a su vez un movimiento
-- posterior). La lógica vive en funciones auxiliares (zero_list_item_stock y
-- restore_list_zero_stock) para poder probarla sin DELETE.
--
-- 'list_zero' no es consumo (is_consumption_event), ni confirmación del Repaso
-- (ancla = compra o conteo), ni medición de ciclo (ventanas = conteos).
--
-- También: el panel de Sugerencias no propone "archivar" un producto que está
-- en la lista activa (con stock 0 a propósito parecería inactivo).
--
-- Los ítems que YA estaban en la lista al aplicar esto no se tocan.
-- Probado en transacción con rollback: agrega con el rol real (2 -> 0, guarda 2),
-- restituye, no duplica, no restituye tras compra ni ajuste manual, no registra
-- nada si ya estaba en 0, rechaza el duplicado, y list_zero no cuenta como consumo.

create or replace function private.zero_list_item_stock(p_list_id uuid, p_product_id uuid, p_user uuid)
returns table (zeroed_qty numeric, movement_id uuid)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_household uuid;
  v_qty numeric;
  v_mov uuid;
begin
  select household_id into v_household from shopping_lists where id = p_list_id;
  if v_household is null then
    return;
  end if;

  perform 1 from products where id = p_product_id and household_id = v_household for update;

  select coalesce(sum(delta), 0) into v_qty
  from stock_movements
  where product_id = p_product_id and household_id = v_household;

  if v_qty > 0 then
    insert into stock_movements (household_id, product_id, delta, reason, created_by)
    values (v_household, p_product_id, -v_qty, 'list_zero', coalesce(auth.uid(), p_user))
    returning id into v_mov;
    return query select v_qty, v_mov;
  end if;
end;
$function$;

create or replace function private.restore_list_zero_stock(p_item public.shopping_list_items)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_zero record;
begin
  if p_item.stock_zero_movement_id is null or p_item.stock_zeroed_qty is null then
    return false;
  end if;

  if not exists (select 1 from products where id = p_item.product_id) then
    return false;
  end if;

  select m.household_id, m.created_at, m.id, m.created_by into v_zero
  from stock_movements m
  where m.id = p_item.stock_zero_movement_id;
  if not found then
    return false;
  end if;

  if exists (
    select 1 from stock_movements m2
    where m2.product_id = p_item.product_id
      and m2.household_id = v_zero.household_id
      and (m2.created_at, m2.id) > (v_zero.created_at, v_zero.id)
  ) then
    return false;
  end if;

  insert into stock_movements (household_id, product_id, delta, reason, created_by)
  values (v_zero.household_id, p_item.product_id, p_item.stock_zeroed_qty, 'list_zero', coalesce(auth.uid(), v_zero.created_by));
  return true;
end;
$function$;

create or replace function private.shopping_list_item_zero_stock()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  z record;
begin
  select * into z from private.zero_list_item_stock(new.list_id, new.product_id, new.added_by);
  if z.movement_id is not null then
    new.stock_zeroed_qty := z.zeroed_qty;
    new.stock_zero_movement_id := z.movement_id;
  end if;
  return new;
end;
$function$;

create or replace function private.shopping_list_item_restore_stock()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  perform private.restore_list_zero_stock(old);
  return old;
end;
$function$;

create trigger shopping_list_items_zero_stock
  before insert on shopping_list_items
  for each row execute function private.shopping_list_item_zero_stock();

create trigger shopping_list_items_restore_stock
  after delete on shopping_list_items
  for each row execute function private.shopping_list_item_restore_stock();

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
