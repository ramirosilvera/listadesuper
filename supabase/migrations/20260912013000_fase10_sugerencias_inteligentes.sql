-- Fase 10: sugerencias inteligentes basadas en el historial de uso.
--
-- No hay infraestructura de ML real acá (sin pipeline de entrenamiento, y
-- con el volumen de datos de un solo hogar -- decenas de productos, una
-- compra semanal -- un modelo entrenado sobreajustaría). Lo que se
-- construye es estadística simple y explicable sobre stock_movements/
-- products, en la misma línea que product_replenishment (Fase 4/8): reglas
-- con un piso mínimo de evidencia (2-3 observaciones) antes de sugerir
-- nada, y siempre mostrando el motivo en texto plano.
--
-- Tres tipos de sugerencia:
--  - ciclo_de_compra: el intervalo real entre compras (stock_movements con
--    delta>0) difiere bastante del restock_cycle_days configurado.
--  - umbral_manual: hay consumo real medido (>=2 bajas de stock) y el
--    low_stock_threshold actual no está calibrado contra ese ritmo.
--  - archivar: no queda stock y hace mucho que no entra a la casa (o nunca
--    se compró desde que se cargó al catálogo) -- candidato a dejar de
--    aparecer en sugeridos.
--
-- Las descartadas se guardan en product_suggestion_dismissals para no
-- insistir con el mismo valor -- pero si la evidencia cambia (nuevo
-- promedio, nueva compra) la sugerencia puede reaparecer con un valor
-- distinto. No hace falta un job que las expire: se auto-resuelven cuando
-- el usuario aplica el cambio (la sugerencia deja de tener sentido) o
-- cuando cambian los datos que la sustentan.

create table product_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  suggestion_type text not null check (suggestion_type in ('ciclo_de_compra', 'umbral_manual', 'archivar')),
  dismissed_value numeric,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid references auth.users (id),
  unique (product_id, suggestion_type)
);

create index product_suggestion_dismissals_household_id_idx on product_suggestion_dismissals (household_id);
create index product_suggestion_dismissals_product_id_idx on product_suggestion_dismissals (product_id);

alter table product_suggestion_dismissals enable row level security;

create policy "members can view dismissals" on product_suggestion_dismissals for select
  using (private.is_household_member(household_id));
create policy "members can manage dismissals" on product_suggestion_dismissals for all
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create view product_suggestions
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
),
restock_intervals as (
  select
    product_id,
    household_id,
    extract(epoch from (created_at - prev_restocked_at)) / 86400 as interval_days
  from restock_events
  where prev_restocked_at is not null
    and created_at >= now() - interval '180 days'
),
cycle_stats as (
  select
    product_id,
    household_id,
    count(*)::int as interval_count,
    avg(interval_days) as avg_interval_days
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
      when count(*) filter (where sm.delta < 0) >= 2 then
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
  round(cs.avg_interval_days)::numeric as suggested_value,
  cs.interval_count as evidence_count,
  format(
    'En los últimos %s ciclos reales, en promedio pasaron %s días entre compras.',
    cs.interval_count, round(cs.avg_interval_days)
  ) as reason
from products p
join cycle_stats cs on cs.product_id = p.id and cs.household_id = p.household_id
where p.archived = false
  and round(cs.avg_interval_days) >= 1
  and (
    p.restock_cycle_days is null
    or abs(cs.avg_interval_days - p.restock_cycle_days) >= greatest(3, p.restock_cycle_days * 0.3)
  )
  and not exists (
    select 1 from product_suggestion_dismissals d
    where d.product_id = p.id and d.suggestion_type = 'ciclo_de_compra'
      and d.dismissed_value = round(cs.avg_interval_days)::numeric
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
    or abs(p.low_stock_threshold - ceil(co.avg_daily_consumption * 3)) >= 1
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

-- Aplicar una sugerencia: pisa el valor real del producto. Al hacerlo la
-- sugerencia deja de cumplir su propia condición y desaparece sola de
-- product_suggestions -- no hace falta marcarla como "aplicada" aparte.
create or replace function apply_product_suggestion(
  p_product_id uuid,
  p_suggestion_type text,
  p_value numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from products where id = p_product_id;

  if v_household_id is null or not private.is_household_member(v_household_id) then
    raise exception 'not authorized';
  end if;

  if p_suggestion_type = 'ciclo_de_compra' then
    update products set restock_cycle_days = p_value::int where id = p_product_id;
  elsif p_suggestion_type = 'umbral_manual' then
    update products set low_stock_threshold = p_value::int where id = p_product_id;
  elsif p_suggestion_type = 'archivar' then
    update products set archived = true where id = p_product_id;
  else
    raise exception 'tipo de sugerencia invalido: %', p_suggestion_type;
  end if;

  delete from product_suggestion_dismissals
  where product_id = p_product_id and suggestion_type = p_suggestion_type;
end;
$$;

revoke execute on function apply_product_suggestion(uuid, text, numeric) from public, anon;
grant execute on function apply_product_suggestion(uuid, text, numeric) to authenticated;

create or replace function dismiss_product_suggestion(
  p_product_id uuid,
  p_suggestion_type text,
  p_value numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from products where id = p_product_id;

  if v_household_id is null or not private.is_household_member(v_household_id) then
    raise exception 'not authorized';
  end if;

  insert into product_suggestion_dismissals (household_id, product_id, suggestion_type, dismissed_value, dismissed_by)
  values (v_household_id, p_product_id, p_suggestion_type, p_value, auth.uid())
  on conflict (product_id, suggestion_type)
  do update set dismissed_value = excluded.dismissed_value, dismissed_at = now(), dismissed_by = excluded.dismissed_by;
end;
$$;

revoke execute on function dismiss_product_suggestion(uuid, text, numeric) from public, anon;
grant execute on function dismiss_product_suggestion(uuid, text, numeric) to authenticated;
