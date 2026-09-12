-- Fase 21: selector de categoría al crear un producto (Lista y Comprar) +
-- editor de categoría en Stock. Antes, category_id nunca se completaba
-- fuera del import CSV de una sola vez (Fase 1) -- todo producto creado
-- desde el uso normal de la app quedaba sin categoría para siempre, sin
-- que nadie (ni el usuario ni la app) lo eligiera.
--
-- Esta migración es puramente de defensa en profundidad en la base: el
-- selector y el editor nuevos (código de frontend, sin migración propia)
-- ahora escriben category_id directo desde el cliente vía PostgREST, algo
-- que antes no pasaba. La policy de "products" solo validaba pertenencia
-- al hogar del producto (household_id), no que el category_id elegido sea
-- una categoría de ESE MISMO hogar -- un id de categoría de otro hogar
-- (o inventado) hubiera pasado la RLS igual. No hay una vía real conocida
-- para explotarlo hoy (el selector solo ofrece las categorías del propio
-- hogar), pero ya no hace falta confiar en que el frontend sea la única
-- barrera.
drop policy "members can manage products" on products;
create policy "members can manage products" on products
for all
using (private.is_household_member(household_id))
with check (
  private.is_household_member(household_id)
  and (
    category_id is null
    or exists (
      select 1 from categories c
      where c.id = category_id and c.household_id = products.household_id
    )
  )
);
