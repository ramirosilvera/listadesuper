-- Fase 25: "marcar para reponer" manual en Stock.
--
-- Pedido del usuario: hay productos de los que a propósito no quieren
-- tener stock acumulado (ej. aceite de oliva -- 1 sola botella a la vez),
-- así que un umbral numérico de stock (Fase 8, low_stock_threshold) no
-- tiene sentido ahí -- quantity_on_hand se queda fijo en "1" mientras la
-- botella abierta se va vaciando, sin que ningún número lo refleje. Lo
-- que necesitan es marcar a mano "esta ya está abierta y le queda poco"
-- para que entre a la señal de reposición, independientemente de la
-- cantidad contada.
--
-- needs_restock es un booleano manual, no calculado: nadie más que la
-- familia sabe cuándo una botella abierta está por acabarse.
alter table products add column needs_restock boolean not null default false;

-- Se prioriza needs_restock por encima de los 3 criterios que ya existían
-- (predicción por consumo, umbral manual, ciclo de compra): si la familia
-- lo marcó a mano, es la señal más directa posible, más confiable que
-- cualquier heurística calculada.
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
      then true
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      then true
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and now() - last_restock.last_restocked_at >= make_interval(days => p.restock_cycle_days)
      then true
    else false
  end as should_restock,
  case
    when p.needs_restock then 'marcado_manual'
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      then 'prediccion'
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      then 'umbral_manual'
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and now() - last_restock.last_restocked_at >= make_interval(days => p.restock_cycle_days)
      then 'ciclo_de_compra'
    else null
  end as restock_reason,
  p.restock_cycle_days,
  last_restock.last_restocked_at,
  case
    when last_restock.last_restocked_at is not null
      then extract(day from now() - last_restock.last_restocked_at)::int
    else null
  end as days_since_last_restock
from products p
left join product_stock ps
  on ps.product_id = p.id and ps.household_id = p.household_id
left join lateral (
  select
    case
      when count(*) filter (where sm.delta < 0) >= 2 then
        coalesce(sum(-sm.delta) filter (where sm.delta < 0), 0)
        / greatest(1, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0))))
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
where p.archived = false;

-- record_purchase: comprar de verdad el producto satisface cualquier
-- marca manual pendiente. Sin este reset automático, la familia tendría
-- que acordarse de desmarcarlo a mano cada vez que compran lo que ya
-- habían marcado -- exactamente la fricción que hace que una marca
-- manual se abandone con el tiempo. Se agrega un solo `update products`
-- dentro del loop de items ya existente; el resto de la función es
-- idéntico a la versión de la Fase 18 (validación cross-tenant,
-- lock de duplicados, inserts de purchase_items/stock_movements/
-- product_expirations, limpieza de la lista activa).
create or replace function record_purchase(
  p_household_id uuid,
  p_store_id uuid,
  p_purchased_at timestamptz,
  p_source text,
  p_receipt_image_path text,
  p_items jsonb,
  p_confirm_duplicate boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_purchase_id uuid;
  v_item jsonb;
  v_purchase_item_id uuid;
  v_total numeric := 0;
  v_qty numeric;
  v_price numeric;
  v_expiration date;
  v_shelf_life int;
  v_dup_minutes int;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items no puede estar vacio';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) elem
    left join products p
      on p.id = (elem ->> 'product_id')::uuid
      and p.household_id = p_household_id
    where p.id is null
  ) then
    raise exception 'uno o mas productos no pertenecen a este hogar';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) elem
    where nullif(elem ->> 'unit_price', '') is not null
      and (elem ->> 'unit_price')::numeric < 0
  ) then
    raise exception 'unit_price no puede ser negativo';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_household_id::text));

  if not p_confirm_duplicate then
    select floor(extract(epoch from (now() - max(p.created_at))) / 60)::int
    into v_dup_minutes
    from purchases p
    join purchase_items pi on pi.purchase_id = p.id
    where p.household_id = p_household_id
      and p.created_at >= now() - interval '20 minutes'
      and pi.product_id in (
        select (elem ->> 'product_id')::uuid from jsonb_array_elements(p_items) elem
      );

    if v_dup_minutes is not null then
      raise exception 'possible_duplicate'
        using detail = case
          when v_dup_minutes < 1 then 'Se registró una compra con productos en común hace menos de un minuto.'
          when v_dup_minutes = 1 then 'Se registró una compra con productos en común hace 1 minuto.'
          else format('Se registró una compra con productos en común hace %s minutos.', v_dup_minutes)
        end;
    end if;
  end if;

  insert into purchases (household_id, store_id, purchased_at, source, receipt_image_path, created_by)
  values (
    p_household_id,
    p_store_id,
    coalesce(p_purchased_at, now()),
    coalesce(p_source, 'manual'),
    p_receipt_image_path,
    auth.uid()
  )
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := nullif(v_item ->> 'unit_price', '')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'quantity invalida en item: %', v_item;
    end if;

    insert into purchase_items (purchase_id, product_id, quantity, unit_price, subtotal)
    values (
      v_purchase_id,
      (v_item ->> 'product_id')::uuid,
      v_qty,
      v_price,
      case when v_price is not null then v_qty * v_price else null end
    )
    returning id into v_purchase_item_id;

    insert into stock_movements (household_id, product_id, delta, reason, purchase_item_id, created_by)
    values (p_household_id, (v_item ->> 'product_id')::uuid, v_qty, 'purchase', v_purchase_item_id, auth.uid());

    update products set needs_restock = false
    where id = (v_item ->> 'product_id')::uuid;

    if v_price is not null then
      v_total := v_total + (v_qty * v_price);
    end if;

    v_expiration := nullif(v_item ->> 'expiration_date', '')::date;
    if v_expiration is null then
      select default_shelf_life_days into v_shelf_life
        from products where id = (v_item ->> 'product_id')::uuid;
      if v_shelf_life is not null then
        v_expiration := (coalesce(p_purchased_at, now()))::date + v_shelf_life;
      end if;
    end if;

    if v_expiration is not null then
      insert into product_expirations (household_id, product_id, purchase_item_id, expiration_date, quantity)
      values (p_household_id, (v_item ->> 'product_id')::uuid, v_purchase_item_id, v_expiration, v_qty);
    end if;

    delete from shopping_list_items sli
    using shopping_lists sl
    where sli.list_id = sl.id
      and sl.household_id = p_household_id
      and sl.status = 'active'
      and sli.product_id = (v_item ->> 'product_id')::uuid;
  end loop;

  update purchases set total_amount = nullif(v_total, 0) where id = v_purchase_id;

  return v_purchase_id;
end;
$function$;
