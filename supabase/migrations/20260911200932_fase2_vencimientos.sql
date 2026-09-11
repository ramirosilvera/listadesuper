-- Fase 2: vencimientos. Registra lotes de vencimiento por compra (FEFO:
-- first-expire-first-out) y una vista con el semaforo ya calculado.
--
-- Decision consciente de alcance: no se instala pg_cron ni se arma un job
-- nocturno en esta migracion. El semaforo se calcula al leer (la vista de
-- abajo), que es todo lo que hace falta para *ver* que se vence algo. Un
-- job nocturno solo aporta valor si dispara una notificacion push/email, y
-- eso necesita secrets (VAPID keys / API key de un proveedor de mail) que
-- no estan disponibles en este entorno — se deja documentado como
-- siguiente paso en docs/plan.md en vez de construir un cron sin nada que
-- dispare al final.

create table product_expirations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  purchase_item_id uuid references purchase_items (id) on delete set null,
  expiration_date date not null,
  quantity numeric not null default 1,
  status text not null default 'active' check (status in ('active', 'consumed', 'discarded')),
  created_at timestamptz not null default now()
);

create index product_expirations_household_id_idx on product_expirations (household_id);
create index product_expirations_product_id_idx on product_expirations (product_id);
create index product_expirations_purchase_item_id_idx on product_expirations (purchase_item_id);
-- la vista de abajo siempre filtra status='active' ordenando por fecha:
-- este parcial cubre exactamente ese acceso.
create index product_expirations_active_by_date_idx
  on product_expirations (household_id, expiration_date)
  where status = 'active';

alter table product_expirations enable row level security;

create policy "members can view expirations" on product_expirations for select
  using (private.is_household_member(household_id));
create policy "members can manage expirations" on product_expirations for all
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- Vista con el semaforo ya calculado (rojo: vencido o <=2 dias, amarillo:
-- <=7 dias, verde: mas adelante). security_invoker=true: sin esto la
-- vista corre con los permisos de quien la creo, sin RLS, y expondria
-- vencimientos de todos los hogares (mismo error que ya cometimos con
-- product_stock en Fase 1, no se repite).
create view product_expirations_upcoming
  with (security_invoker = true)
as
select
  pe.id,
  pe.household_id,
  pe.product_id,
  p.name as product_name,
  p.unit_label,
  pe.expiration_date,
  pe.quantity,
  (pe.expiration_date - current_date) as days_until,
  case
    when pe.expiration_date < current_date then 'expired'
    when pe.expiration_date - current_date <= 2 then 'red'
    when pe.expiration_date - current_date <= 7 then 'amber'
    else 'green'
  end as level
from product_expirations pe
join products p on p.id = pe.product_id
where pe.status = 'active'
order by pe.expiration_date asc;

-- Marca un vencimiento como resuelto. 'discarded' (se vencio y se tiro)
-- ademas descuenta stock real via un stock_movement — mismo reason que ya
-- existia en el check constraint de Fase 1. 'consumed' (se uso normal,
-- antes de vencerse) no toca stock: el consumo ya se refleja por otros
-- ajustes, esto solo saca el ítem del semaforo.
create or replace function resolve_expiration(
  p_expiration_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_product_id uuid;
  v_quantity numeric;
begin
  select household_id, product_id, quantity
    into v_household_id, v_product_id, v_quantity
    from product_expirations
    where id = p_expiration_id;

  if v_household_id is null then
    raise exception 'vencimiento no encontrado';
  end if;

  if not private.is_household_member(v_household_id) then
    raise exception 'not a member of this household';
  end if;

  if p_status not in ('consumed', 'discarded') then
    raise exception 'status invalido: %', p_status;
  end if;

  update product_expirations
    set status = p_status
    where id = p_expiration_id;

  if p_status = 'discarded' then
    insert into stock_movements (household_id, product_id, delta, reason, created_by)
    values (v_household_id, v_product_id, -v_quantity, 'expired_discard', auth.uid());
  end if;
end;
$$;

revoke execute on function resolve_expiration(uuid, text) from public, anon;
grant execute on function resolve_expiration(uuid, text) to authenticated;

-- record_purchase (Fase 1) se reemplaza para aceptar un expiration_date
-- opcional por item; si no se manda pero el producto tiene
-- default_shelf_life_days, se calcula solo desde la fecha de compra.
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
  v_expiration date;
  v_shelf_life int;
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

    -- vencimiento: explicito si vino, si no default_shelf_life_days del producto
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

revoke execute on function record_purchase(uuid, uuid, timestamptz, text, text, jsonb) from public, anon;
grant execute on function record_purchase(uuid, uuid, timestamptz, text, text, jsonb) to authenticated;
