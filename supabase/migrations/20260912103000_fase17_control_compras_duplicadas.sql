-- Fase 17: control de compras duplicadas.
--
-- Pedido explicito: un mismo usuario (doble toque, reintento tras una
-- respuesta lenta) o dos usuarios del mismo hogar (ambos en el super,
-- cada uno carga "su" compra sin saber que el otro ya lo hizo) pueden
-- registrar la misma compra por error. El boton "Confirmar compra" ya
-- se deshabilita mientras esta en vuelo (comprar-client.tsx), pero eso
-- no cubre ni un reintento despues de un error ni, sobre todo, el caso
-- de dos DISPOSITIVOS distintos enviando casi al mismo tiempo -- ahi la
-- unica verificacion confiable tiene que vivir en el server, no en un
-- estado de React de una sola pestaña.
--
-- Regla (deliberadamente simple, no es un modelo de deteccion de fraude):
-- si en los ultimos 20 minutos ya se registro, en el mismo hogar, una
-- compra que comparte al menos un producto con la que se esta por
-- cargar, se avisa antes de insertar en vez de guardarla derecho. No es
-- un bloqueo duro: el nuevo parametro p_confirm_duplicate, en false por
-- defecto, hace que la funcion tire un error distinguible
-- ('possible_duplicate') la PRIMERA vez; el cliente lo atrapa, muestra
-- una confirmacion, y si la persona confirma que quiere cargarla igual
-- reintenta la misma llamada con p_confirm_duplicate = true, que salta
-- el chequeo. Una compra genuina en un dia con varias idas al super
-- nunca queda bloqueada, solo pide un toque mas de confirmacion.
--
-- Se agrega un parametro nuevo (p_confirm_duplicate), lo que cambia la
-- firma de la funcion -- "create or replace" no alcanza para esto, hay
-- que borrar la version vieja de 6 parametros primero o quedan dos
-- overloads (uno con el chequeo, uno sin) coexistiendo.
drop function if exists record_purchase(uuid, uuid, timestamptz, text, text, jsonb);

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
set search_path = public
as $$
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
$$;

revoke execute on function record_purchase(uuid, uuid, timestamptz, text, text, jsonb, boolean) from public, anon;
grant execute on function record_purchase(uuid, uuid, timestamptz, text, text, jsonb, boolean) to authenticated;
