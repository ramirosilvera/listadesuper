-- Fase 18: auditoría integral pre-publicación — correcciones de la
-- revisión con 4 roles (seguridad/RLS, confiabilidad/concurrencia,
-- recorrido de usuario, mobile/PWA). Esta migración cubre los hallazgos
-- de seguridad y de datos; los hallazgos de UI/UX se corrigen en el
-- código del frontend por separado.
--
-- ============================================================
-- 1) ALTO, CONFIRMADO: record_purchase no validaba que cada product_id
--    de p_items perteneciera a p_household_id. Al ser SECURITY DEFINER
--    (dueño del rol de migraciones, que tiene rolbypassrls), un miembro
--    del hogar A podía mandar un product_id de OTRO hogar (B) y la
--    función lo insertaba igual en purchase_items/stock_movements/
--    product_expirations -- una escritura cross-tenant real, y además
--    una vía de lectura de 1 entero (default_shelf_life_days de B,
--    reflejado en el expiration_date que A sí puede leer). Se agrega
--    una validación explícita antes de cualquier insert.
-- 2) MEDIO, CONFIRMADO: mismo defecto en adjust_stock.
-- 3) ALTO, CONFIRMADO (revisión de confiabilidad): el chequeo de
--    "posible duplicado" agregado en Fase 17 tiene una condición de
--    carrera real -- el SELECT que busca compras recientes y el INSERT
--    posterior no están serializados, así que dos llamadas concurrentes
--    (el caso "dos personas del hogar cargando casi al mismo tiempo" que
--    la Fase 17 dice cubrir) pueden pasar el chequeo las dos sin que
--    ninguna vea la fila de la otra. Se agrega un lock de advisory
--    (pg_advisory_xact_lock, scopeado por household_id, se libera solo
--    al terminar la transacción) que serializa las llamadas de
--    record_purchase para el MISMO hogar sin bloquear entre hogares
--    distintos -- para 2-3 compras por semana de un mismo hogar, el
--    costo de contención es nulo en la práctica.
-- 4) BAJO, CONFIRMADO (revisión UX): no se validaba unit_price negativo
--    ni en cliente ni en el server -- un "-" de más rompía los totales
--    de Reportes en silencio. Se agrega la validación en el server
--    (defensa de fondo real, no solo en el cliente).
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

  -- Todos los product_id tienen que pertenecer a este hogar. Sin esto,
  -- un product_id ajeno pasa derecho a purchase_items/stock_movements/
  -- product_expirations (ver nota de seguridad arriba).
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

  -- Precio negativo no tiene sentido y rompe los totales de Reportes en
  -- silencio (cantidad ya se valida mas abajo, en el loop).
  if exists (
    select 1
    from jsonb_array_elements(p_items) elem
    where nullif(elem ->> 'unit_price', '') is not null
      and (elem ->> 'unit_price')::numeric < 0
  ) then
    raise exception 'unit_price no puede ser negativo';
  end if;

  -- Serializa las llamadas de record_purchase para ESTE hogar (no afecta
  -- a otros hogares): sin esto, el chequeo de "posible duplicado" de
  -- abajo tiene una ventana de carrera real entre el SELECT y el INSERT.
  -- Se libera solo al terminar la transaccion (commit o rollback).
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

-- ============================================================
-- 2) adjust_stock: mismo defecto que record_purchase (ver arriba).
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

  if not exists (
    select 1 from products where id = p_product_id and household_id = p_household_id
  ) then
    raise exception 'el producto no pertenece a este hogar';
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

-- ============================================================
-- 3) BAJO, CONFIRMADO: create_household aceptaba nombre vacío o solo
--    espacios.
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
  if p_name is null or trim(p_name) = '' then
    raise exception 'el nombre del hogar no puede estar vacio';
  end if;

  loop
    v_code := generate_invite_code();
    begin
      insert into households (name, created_by, invite_code)
      values (trim(p_name), auth.uid(), v_code)
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

-- ============================================================
-- 4) BAJO, defensa en profundidad (no explotable hoy via PostgREST,
--    señalado por la revisión de seguridad): pg_temp se busca primero
--    para nombres de relación sin calificar, incluso si no aparece en
--    search_path -- salvo que se lo incluya explícitamente en algún
--    lugar de la lista, lo que anula esa prioridad implícita. Se agrega
--    a las 10 funciones SECURITY DEFINER del esquema.
alter function public.adjust_stock(uuid, uuid, numeric, text) set search_path = 'public', 'pg_temp';
alter function public.apply_product_suggestion(uuid, text, numeric) set search_path = 'public', 'pg_temp';
alter function public.create_household(text) set search_path = 'public', 'pg_temp';
alter function public.dismiss_product_suggestion(uuid, text, numeric) set search_path = 'public', 'pg_temp';
alter function public.join_household_by_code(text) set search_path = 'public', 'pg_temp';
alter function public.record_purchase(uuid, uuid, timestamptz, text, text, jsonb, boolean) set search_path = 'public', 'pg_temp';
alter function public.resolve_expiration(uuid, text) set search_path = 'public', 'pg_temp';
alter function public.seed_initial_stock(uuid) set search_path = 'public', 'pg_temp';
alter function private.handle_new_household() set search_path = 'public', 'pg_temp';
alter function private.is_household_member(uuid) set search_path = 'public', 'pg_temp';
