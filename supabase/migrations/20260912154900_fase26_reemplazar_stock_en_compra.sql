-- Fase 26: al confirmar una compra real en Comprar, permitir elegir si
-- esta compra SUMA al stock que había o lo REEMPLAZA.
--
-- Seguimiento directo de la fase anterior ("ciclo de compra vencido"): ahí
-- se descartó resetear quantity_on_hand a 0 automáticamente al vencer un
-- ciclo, porque fabricaba una cantidad falsa sin que nadie la confirmara.
-- La alternativa propuesta entonces era esta: dejar que la PERSONA
-- confirme, en el momento exacto de una compra real (cuando tiene la
-- información real a mano), si el número de Stock necesitaba corregirse.
-- Por defecto sigue sumando (mismo comportamiento de siempre); "reemplaza"
-- es la opción explícita para cuando el conteo quedó desactualizado.
--
-- p_items ahora acepta un campo opcional "replace_stock" (boolean, default
-- false) por ítem. Con replace_stock=true, se calcula el delta necesario
-- para que quantity_on_hand (= sum(delta) sobre stock_movements, ver vista
-- product_stock) termine dando exactamente la cantidad comprada -- no se
-- sobreescribe ninguna fila existente, sigue siendo un movimiento más en
-- el historial real, solo que con el signo/magnitud que hace falta para
-- llegar al número correcto.
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
  v_replace boolean;
  v_current_qty numeric;
  v_delta numeric;
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

    -- replace_stock=true: esta compra real reemplaza el conteo de Stock
    -- en vez de sumarse -- pensado para cuando el numero de Stock quedo
    -- desactualizado y la persona confirma, en el momento exacto que
    -- tiene la info, cuanto queda de verdad. Se calcula el delta
    -- necesario para que quantity_on_hand (= sum(delta), ver vista
    -- product_stock) termine dando exactamente v_qty -- no se sobreescribe
    -- ninguna fila, sigue siendo un movimiento mas en el historial real.
    v_replace := coalesce((v_item ->> 'replace_stock')::boolean, false);
    if v_replace then
      select coalesce(sum(delta), 0) into v_current_qty
      from stock_movements
      where product_id = (v_item ->> 'product_id')::uuid
        and household_id = p_household_id;
      v_delta := v_qty - v_current_qty;
    else
      v_delta := v_qty;
    end if;

    insert into stock_movements (household_id, product_id, delta, reason, purchase_item_id, created_by)
    values (p_household_id, (v_item ->> 'product_id')::uuid, v_delta, 'purchase', v_purchase_item_id, auth.uid());

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
