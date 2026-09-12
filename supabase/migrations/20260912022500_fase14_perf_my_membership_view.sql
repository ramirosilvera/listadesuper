-- Fase 14: reducir el tiempo hasta el primer contenido al abrir la app.
--
-- getActiveHousehold() (src/lib/household.ts) hacía dos llamadas de red
-- SECUENCIALES en cada request: auth.getUser() y despues, ya con el id
-- del usuario, una consulta a household_members filtrada por
-- `user_id = <ese id>`. La segunda dependia del resultado de la primera
-- solo porque el filtro se armaba en el cliente -- pero Postgres ya sabe
-- quien es el usuario autenticado en cada request via auth.uid(), sin
-- necesidad de que el cliente se lo pase. Esta vista mueve el filtro
-- adentro de la base (where user_id = auth.uid(), evaluado por request)
-- para que la consulta ya no necesite conocer el id del usuario de
-- antemano, y asi las dos llamadas puedan dispararse en paralelo
-- (Promise.all) en vez de una despues de la otra.
--
-- No se usa el embed automatico de PostgREST (`households(...)`) porque
-- eso depende de que PostgREST pueda inferir la relacion FK a traves de
-- una vista, algo que no es fiable en todas las versiones -- se resuelve
-- con un join explicito adentro de la vista, un solo viaje de red igual.
create view my_membership
  with (security_invoker = true)
as
select
  hm.household_id,
  hm.role,
  h.name as household_name,
  h.invite_code as household_invite_code
from household_members hm
join households h on h.id = hm.household_id
where hm.user_id = auth.uid();
