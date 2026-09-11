-- RPCs de Fase 1. A diferencia de is_household_member/handle_new_household
-- (Fase 0, movidas a `private`), estas SI estan pensadas para invocarse
-- directo desde el cliente via /rest/v1/rpc/..., asi que viven en `public`
-- y tienen EXECUTE explicito para `authenticated` solamente.

-- Crea una compra + sus lineas + los movimientos de stock correspondientes
-- en una sola transaccion atomica, y saca de la lista activa los productos
-- comprados. p_items: [{"product_id": "...", "quantity": 1, "unit_price": 100}]
create or replace function record_purchase(
  p_household_id uuid,
  p_store_id uuid,
  p_purchased_at timestamptz,
  p_source text,
  p_receipt_image_path text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_item jsonb;
  v_purchase_item_id uuid;
  v_total numeric := 0;
  v_qty numeric;
  v_price numeric;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items no puede estar vacio';
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

    if v_price is not null then
      v_total := v_total + (v_qty * v_price);
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
$$;

revoke execute on function record_purchase(uuid, uuid, timestamptz, text, text, jsonb) from public, anon;
grant execute on function record_purchase(uuid, uuid, timestamptz, text, text, jsonb) to authenticated;

-- Ajuste manual de stock (ej: "conté 2 en la alacena", o "se vencio y lo tire").
create or replace function adjust_stock(
  p_household_id uuid,
  p_product_id uuid,
  p_delta numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  if p_reason not in ('manual_adjust', 'expired_discard', 'consumption') then
    raise exception 'reason invalido: %', p_reason;
  end if;

  insert into stock_movements (household_id, product_id, delta, reason, created_by)
  values (p_household_id, p_product_id, p_delta, p_reason, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function adjust_stock(uuid, uuid, numeric, text) from public, anon;
grant execute on function adjust_stock(uuid, uuid, numeric, text) to authenticated;

-- Alta de hogar + codigo de invitacion propio (mas simple que un flujo de
-- invitacion por email, alcanza para un hogar de pocas personas).
alter table households add column invite_code text unique;

create or replace function generate_invite_code()
returns text
language sql
as $$
  select substr(replace(encode(extensions.gen_random_bytes(6), 'base64'), '/', '_'), 1, 8);
$$;

create or replace function create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_attempts int := 0;
begin
  loop
    v_code := generate_invite_code();
    begin
      insert into households (name, created_by, invite_code)
      values (p_name, auth.uid(), v_code)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'no se pudo generar un invite_code unico';
      end if;
    end;
  end loop;

  return v_id;
end;
$$;

revoke execute on function create_household(text) from public, anon;
grant execute on function create_household(text) to authenticated;

create or replace function join_household_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select id into v_household_id from households where invite_code = p_invite_code;

  if v_household_id is null then
    raise exception 'codigo de invitacion invalido';
  end if;

  insert into household_members (household_id, user_id, role)
  values (v_household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

revoke execute on function join_household_by_code(text) from public, anon;
grant execute on function join_household_by_code(text) to authenticated;
