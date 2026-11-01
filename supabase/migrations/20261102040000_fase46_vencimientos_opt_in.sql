-- ESTADO: NO APLICADA a la base (Supabase pidio una confirmacion que no llego).
-- No hay codigo de la app que dependa de ella todavia. Al aplicarla, renombrar este
-- archivo con la version que registre la base y quitar este aviso.
--
-- Fase 46: Vencimientos pasa a ser opt-in por producto (/consejo).
--
-- Pedido: "el módulo de vencimientos elimínalo, no lo usamos; o déjalo mínimo a
-- productos que no suelen tener rotación... poner una casilla de si este
-- producto va a la lista de vencimientos o no... hacé un primer relevamiento y
-- una limpieza". Medido: de 233 vencimientos solo 1 activo estaba confirmado por
-- una persona; los otros 216 eran estimaciones automáticas (fecha de compra +
-- vida útil por defecto) y le asignaban "vence" a papel higiénico, bolsas de
-- basura o lavandina. Se descartó ELIMINAR el módulo: sirve para lo que se olvida
-- en la alacena (enlatados, salsas, untables). Se deja mínimo y opt-in.
--
-- 1) products.track_expiration (default false): la casilla.
-- 2) Estado 'untracked' en product_expirations = "dejó de controlarse". No se
--    reutiliza 'discarded' porque resolve_expiration(..., 'discarded') además
--    descuenta stock (significa "lo tiré por vencido").
-- 3) record_purchase: solo crea el vencimiento si el producto está controlado, o
--    si la persona escribió una fecha a mano (en cuyo caso el producto pasa a
--    controlarse). Antes creaba uno para todo lo que tuviera vida útil por
--    defecto. seed_initial_stock: igual (solo productos controlados).
-- 4) La vista product_expirations_upcoming solo muestra productos controlados
--    (y con stock, ver Fase 45).
-- 5) Primer relevamiento: se activan 22 productos de baja rotación donde el
--    vencimiento sí se olvida (enlatados y conservas, salsas, untables, frutos
--    secos, coco, harina leudante, polvo de hornear, aceite de oliva premium, té,
--    leche larga vida, crema de leche, fritolín) y Esponja de cocina (único
--    vencimiento confirmado por una persona). Quedan afuera los de alta rotación
--    (leche, huevos, quesos, pan, masas, fideos, congelados) y todo lo que no es
--    comestible (limpieza, higiene, descartables, bebé, mascotas, insecticidas).
-- 6) Limpieza: los lotes activos de productos NO controlados pasan a 'untracked'
--    (no se borra nada, es reversible); en los controlados, los lotes que el
--    stock ya no cubre (FIFO: se asume que se consume primero lo más viejo) pasan
--    a 'consumed'. Las fechas que quedan siguen siendo ESTIMADAS (fecha de la
--    carga inicial + vida útil): hay que confirmarlas mirando el envase.

alter table products add column if not exists track_expiration boolean not null default false;

alter table product_expirations drop constraint product_expirations_status_check;
alter table product_expirations add constraint product_expirations_status_check
  check (status in ('active', 'consumed', 'discarded', 'untracked'));

update products set track_expiration = true
where not archived and name in (
  'Atún en lata', 'Choclo en lata', 'Extracto de tomate', 'Aceituna',
  'Reducción de aceto balsámico', 'Salsa de barbacoa', 'Ketchup', 'Mayonesa',
  'Salsa de soja', 'Dulce de leche', 'Mermelada', 'Pasta de maní', 'Maní',
  'Coco rallado', 'Harina leudante', 'Polvo de hornear', 'Aceite de oliva premium',
  'Té', 'Crema (de leche)', 'Leche larga vida', 'Fritolín',
  'Esponja de cocina'
);

update product_expirations pe set status = 'untracked'
from products p
where p.id = pe.product_id and pe.status = 'active' and not p.track_expiration;

with ranked as (
  select pe.id, pe.quantity, coalesce(ps.quantity_on_hand, 0) as stock,
    sum(pe.quantity) over (partition by pe.product_id order by pe.created_at desc, pe.id) as cum
  from product_expirations pe
  join products p on p.id = pe.product_id
  left join product_stock ps on ps.product_id = pe.product_id
  where pe.status = 'active' and p.track_expiration
)
update product_expirations pe set status = 'consumed'
from ranked r
where pe.id = r.id and (r.cum - r.quantity) >= r.stock;

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
  and p.track_expiration
  and coalesce(ps.quantity_on_hand, 0) > 0
order by pe.expiration_date;

create or replace function seed_initial_stock(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_stock_seeded int := 0;
  v_expirations_seeded int := 0;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  insert into stock_movements (household_id, product_id, delta, reason, created_by)
  select p_household_id, p.id, 1, 'initial_load', auth.uid()
  from products p
  where p.household_id = p_household_id
    and p.archived = false
    and not exists (
      select 1 from stock_movements sm where sm.product_id = p.id
    );
  get diagnostics v_stock_seeded = row_count;

  -- Fase 46: solo productos con vencimiento controlado.
  insert into product_expirations (household_id, product_id, expiration_date, quantity)
  select p_household_id, p.id, current_date + p.default_shelf_life_days, 1
  from products p
  where p.household_id = p_household_id
    and p.archived = false
    and p.track_expiration
    and p.default_shelf_life_days is not null
    and not exists (
      select 1 from product_expirations pe
      where pe.product_id = p.id and pe.status = 'active'
    );
  get diagnostics v_expirations_seeded = row_count;

  return jsonb_build_object(
    'stock_seeded', v_stock_seeded,
    'expirations_seeded', v_expirations_seeded
  );
end;
$function$;

create or replace function record_purchase(
  p_household_id uuid,
  p_store_id uuid,
  p_purchased_at timestamp with time zone,
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
  v_track boolean;
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

    -- Fase 46: el vencimiento es opt-in por producto. Una fecha escrita a mano
    -- es una decision (el producto pasa a controlarse); sin fecha, solo se
    -- estima desde la vida util por defecto si el producto ya esta controlado.
    v_expiration := nullif(v_item ->> 'expiration_date', '')::date;
    select track_expiration, default_shelf_life_days into v_track, v_shelf_life
      from products where id = (v_item ->> 'product_id')::uuid;

    if v_expiration is not null then
      if not v_track then
        update products set track_expiration = true
        where id = (v_item ->> 'product_id')::uuid;
      end if;
    elsif v_track and v_shelf_life is not null then
      v_expiration := (coalesce(p_purchased_at, now()))::date + v_shelf_life;
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
