-- Fase 32: nombre legible por usuario, para poder mostrar "quién hizo
-- qué" en vez de un id interno. La app ya guarda QUIÉN hizo cada cosa en
-- varias tablas (purchases.created_by, stock_movements.created_by,
-- shopping_list_items.added_by/checked_by) -- lo que faltaba era un
-- nombre para mostrar en vez de ese uuid. Se agrega ahora, sin tocar auth.users
-- (Supabase no expone esa tabla para editar desde la app): tabla propia
-- profiles, mismo patrón ya usado en este proyecto para provisioning
-- automático (ver private.handle_new_household -- trigger en insert,
-- SECURITY DEFINER, search_path fijo).
--
-- Alcance de esta fase (a pedido del usuario): la infraestructura general
-- de nombres + aplicarla al Historial de compras y al export JSON. No se
-- tocó Lista ni Stock todavía -- la base ya queda lista para extenderlo
-- ahí si hace falta más adelante, sin otra migración.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Un nombre de pila solo debería ser visible para quien comparte hogar
-- con esa persona (o para una misma viendo su propio perfil) -- nunca
-- para cualquier usuario autenticado de la app.
create policy "ver perfiles propios o de convivientes"
on profiles for select
using (
  id = auth.uid()
  or exists (
    select 1
    from household_members hm1
    join household_members hm2 on hm1.household_id = hm2.household_id
    where hm1.user_id = auth.uid() and hm2.user_id = profiles.id
  )
);

create policy "actualizar el propio perfil"
on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- Cualquier usuario nuevo (futuro integrante que se una a un hogar) queda
-- con un nombre por defecto (prefijo del email) en vez de sin perfil --
-- evita que un join futuro se quede sin nombre para mostrar. La persona
-- puede cambiarlo después (policy de update de arriba); no hay todavía
-- una pantalla para eso, es un paso siguiente si hace falta.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  insert into profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Nombres reales pedidos por el usuario para el hogar "Casa": owner
-- (ra1990@hotmail.com, creó el hogar) = Rami; el otro integrante
-- (mariaconstanzamp@gmail.com) = Coti.
insert into profiles (id, display_name) values
  ('2d0a837d-0aa4-4109-a6e4-5f24cba785a0', 'Rami'),
  ('4421be8f-bbcf-4910-8935-e4089d62040f', 'Coti')
on conflict (id) do update set display_name = excluded.display_name;
