-- Fase 0: esquema base de hogares compartidos (households) y RLS.
-- El resto del modelo de datos (products, shopping_lists, stock_movements,
-- product_expirations, etc.) se agrega en Fase 1, ver docs/plan.md.

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);

create table household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table households enable row level security;
alter table household_members enable row level security;

-- Evita la recursión de RLS al chequear membresía desde las policies de
-- households/household_members (y de cualquier tabla futura scopeada por
-- household_id).
create or replace function is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

-- Al crear un hogar, el creador queda como owner automáticamente. Corre
-- como security definer (dueño de la función = rol de las migraciones, que
-- no tiene RLS forzado sobre la tabla), así que no choca con la policy de
-- household_members de abajo.
create or replace function handle_new_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_household_created
  after insert on households
  for each row execute function handle_new_household();

-- Policies: households
create policy "members can view their households"
  on households for select
  using (is_household_member(id));

create policy "authenticated users can create a household"
  on households for insert
  with check (auth.uid() = created_by);

create policy "owners can update their household"
  on households for update
  using (
    exists (
      select 1
      from household_members
      where household_id = households.id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- Policies: household_members
create policy "members can view membership of their households"
  on household_members for select
  using (is_household_member(household_id));

create policy "owners can add members"
  on household_members for insert
  with check (
    exists (
      select 1
      from household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = auth.uid()
        and hm.role = 'owner'
    )
  );

create policy "members can leave, owners can remove members"
  on household_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = auth.uid()
        and hm.role = 'owner'
    )
  );
