-- generate_invite_code() quedo sin search_path fijo (el linter de
-- seguridad lo marca como "Function Search Path Mutable"). Las otras 4
-- funciones nuevas de esta fase (adjust_stock, create_household,
-- join_household_by_code, record_purchase) SI aparecen en el advisor como
-- "ejecutables por authenticated via RPC" pero eso es intencional: son
-- justamente la API que va a usar el cliente.
create or replace function generate_invite_code()
returns text
language sql
set search_path = public, extensions
as $$
  select substr(replace(encode(extensions.gen_random_bytes(6), 'base64'), '/', '_'), 1, 8);
$$;
