-- El linter de seguridad de Supabase marca que Postgres otorga EXECUTE
-- sobre funciones nuevas a PUBLIC por default, lo que deja
-- is_household_member() y handle_new_household() invocables directamente
-- via RPC (/rest/v1/rpc/...) por cualquier usuario anon/authenticated.
-- Ninguna de las dos está pensada para llamarse así: is_household_member()
-- se usa solo dentro de las policies de RLS, y handle_new_household() solo
-- como trigger (llamarla directo ni siquiera funciona, porque depende de
-- NEW). Se revoca el acceso público explícitamente.

revoke execute on function is_household_member(uuid) from public, anon, authenticated;
revoke execute on function handle_new_household() from public, anon, authenticated;
