-- Fase 1: catalogo de productos, listas de compras compartidas, compras y
-- stock (ledger). Ver docs/plan.md. Simplificacion consciente respecto al
-- plan original: no se crea una tabla `units` separada con factores de
-- conversion (kg/g/L/ml) - cada producto lleva un unit_label de texto
-- libre (ej "kg", "paquete", "unidad"), suficiente para el MVP; si Fase 4
-- (prediccion de consumo) necesita conversion real entre unidades se
-- agrega ahi, no antes.

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  name text not null,
  unit_label text not null default 'unidad',
  default_shelf_life_days int,
  barcode text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null default 'Lista de súper',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  quantity numeric not null default 1,
  checked boolean not null default false,
  checked_at timestamptz,
  checked_by uuid references auth.users (id),
  added_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (list_id, product_id)
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  store_id uuid references stores (id) on delete set null,
  purchased_at timestamptz not null default now(),
  total_amount numeric,
  source text not null default 'manual' check (source in ('manual', 'ocr')),
  receipt_image_path text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases (id) on delete cascade,
  product_id uuid not null references products (id) on delete restrict,
  quantity numeric not null,
  unit_price numeric,
  subtotal numeric,
  created_at timestamptz not null default now()
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  delta numeric not null,
  reason text not null check (reason in ('purchase', 'consumption', 'manual_adjust', 'expired_discard')),
  purchase_item_id uuid references purchase_items (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- security_invoker: sin esto, una vista corre con los permisos de su
-- dueño (quien migra, sin RLS) y cualquier authenticated vería el stock
-- de TODOS los hogares, no solo el propio.
create view product_stock
  with (security_invoker = true)
as
select
  product_id,
  household_id,
  sum(delta) as quantity_on_hand,
  max(created_at) as last_movement_at
from stock_movements
group by product_id, household_id;

-- indices para foreign keys / lookups frecuentes
create index categories_household_id_idx on categories (household_id);
create index products_household_id_idx on products (household_id);
create index products_category_id_idx on products (category_id);
create index stores_household_id_idx on stores (household_id);
create index shopping_lists_household_id_idx on shopping_lists (household_id);
create index shopping_lists_created_by_idx on shopping_lists (created_by);
create index shopping_list_items_list_id_idx on shopping_list_items (list_id);
create index shopping_list_items_product_id_idx on shopping_list_items (product_id);
create index shopping_list_items_checked_by_idx on shopping_list_items (checked_by);
create index shopping_list_items_added_by_idx on shopping_list_items (added_by);
create index purchases_household_id_idx on purchases (household_id);
create index purchases_store_id_idx on purchases (store_id);
create index purchases_created_by_idx on purchases (created_by);
create index purchase_items_purchase_id_idx on purchase_items (purchase_id);
create index purchase_items_product_id_idx on purchase_items (product_id);
create index stock_movements_household_id_idx on stock_movements (household_id);
create index stock_movements_product_id_idx on stock_movements (product_id);
create index stock_movements_purchase_item_id_idx on stock_movements (purchase_item_id);
create index stock_movements_created_by_idx on stock_movements (created_by);

alter table categories enable row level security;
alter table products enable row level security;
alter table stores enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table stock_movements enable row level security;

-- categories
create policy "members can view categories" on categories for select
  using (private.is_household_member(household_id));
create policy "members can manage categories" on categories for all
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- products
create policy "members can view products" on products for select
  using (private.is_household_member(household_id));
create policy "members can manage products" on products for all
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- stores
create policy "members can view stores" on stores for select
  using (private.is_household_member(household_id));
create policy "members can manage stores" on stores for all
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- shopping_lists
create policy "members can view shopping lists" on shopping_lists for select
  using (private.is_household_member(household_id));
create policy "members can manage shopping lists" on shopping_lists for all
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- shopping_list_items (household via shopping_lists)
create policy "members can view shopping list items" on shopping_list_items for select
  using (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.list_id
        and private.is_household_member(sl.household_id)
    )
  );
create policy "members can manage shopping list items" on shopping_list_items for all
  using (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.list_id
        and private.is_household_member(sl.household_id)
    )
  )
  with check (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.list_id
        and private.is_household_member(sl.household_id)
    )
  );

-- purchases
create policy "members can view purchases" on purchases for select
  using (private.is_household_member(household_id));
create policy "members can manage purchases" on purchases for all
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- purchase_items (household via purchases)
create policy "members can view purchase items" on purchase_items for select
  using (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id
        and private.is_household_member(p.household_id)
    )
  );
create policy "members can manage purchase items" on purchase_items for all
  using (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id
        and private.is_household_member(p.household_id)
    )
  )
  with check (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id
        and private.is_household_member(p.household_id)
    )
  );

-- stock_movements: solo lectura directa para los miembros; los inserts
-- pasan por record_purchase()/adjust_stock() (security definer) para
-- garantizar consistencia, así que no hay policy de insert/update/delete
-- para el rol authenticated.
create policy "members can view stock movements" on stock_movements for select
  using (private.is_household_member(household_id));
