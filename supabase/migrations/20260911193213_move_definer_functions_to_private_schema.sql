-- Corrige la migracion anterior (20260911190100), que revocaba EXECUTE de
-- is_household_member()/handle_new_household() para `authenticated` con la
-- intencion de que el linter de seguridad deje de marcarlas como invocables
-- via /rest/v1/rpc/... El problema: `authenticated` SI necesita EXECUTE
-- para que las policies de RLS puedan evaluar is_household_member() cuando
-- un usuario logueado hace un SELECT normal sobre households/household_members
-- (el permiso de ejecutar una funcion aplica sea cual sea el contexto desde
-- el que se la llama, incluida una policy). Con la revocacion anterior tal
-- cual quedaba, ningun usuario autenticado podia leer su propio hogar.
--
-- El arreglo correcto (documentado por Supabase, ver "Do I need to expose
-- security definer Functions in Row Level Security Policies?") es mover
-- las funciones a un schema que PostgREST no expone via API (no hace falta
-- agregarlo a Exposed Schemas ni a Extra Search Path): quedan disponibles
-- para las policies igual que antes (Postgres las resuelve por OID, no por
-- nombre), pero PostgREST deja de generar la ruta /rest/v1/rpc/... porque
-- ese schema no es uno de los expuestos.

create schema if not exists private;

alter function is_household_member(uuid) set schema private;
alter function handle_new_household() set schema private;

-- authenticated necesita poder ejecutar is_household_member() para que las
-- policies de households/household_members funcionen en un SELECT normal.
grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;

-- handle_new_household() solo la llama el trigger (corre con los permisos
-- del dueño de la funcion), ningun rol de API necesita invocarla directo.
revoke execute on function private.handle_new_household() from public, anon, authenticated;
