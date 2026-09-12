-- Fase 24: permitir eliminar (DELETE real, no archivar) productos ya
-- archivados. Pedido: hay productos cargados como duplicados, con nombre
-- ambiguo o incompleto (del import inicial de la Fase 1) que se
-- archivaron pero en realidad no tiene sentido conservarlos para siempre.
--
-- La única protección real hasta ahora era products.archived (soft
-- delete) para no perder el historial de compras/gastos de Reportes (ver
-- fix_purchase_items_fk.sql: el ON DELETE CASCADE de purchase_items
-- existe para poder borrar un hogar entero, no para habilitar borrar
-- productos con historial real -- la app nunca debía hacer ese DELETE
-- directamente). Esta migración reemplaza esa protección "informal" por
-- una restricción real a nivel de RLS: solo se puede eliminar un producto
-- que YA está archivado y que nunca tuvo una compra real registrada
-- (sin filas en purchase_items). Verificado sobre los datos reales: los
-- 30 productos archivados hoy tienen 0 compras reales cada uno, así que
-- todos son elegibles -- pero la regla es general, no un permiso ad-hoc
-- para el estado actual.
--
-- "members can manage products" (FOR ALL) se separa en 4 policies -- las
-- de select/insert/update quedan funcionalmente idénticas a como estaban
-- (insert/update ya traían el chequeo de category_id de la Fase 21), y se
-- agrega una nueva específica para delete con la restricción real.
drop policy "members can manage products" on products;

create policy "members can view products" on products
for select
using (private.is_household_member(household_id));

create policy "members can insert products" on products
for insert
with check (
  private.is_household_member(household_id)
  and (
    category_id is null
    or exists (select 1 from categories c where c.id = category_id and c.household_id = products.household_id)
  )
);

create policy "members can update products" on products
for update
using (private.is_household_member(household_id))
with check (
  private.is_household_member(household_id)
  and (
    category_id is null
    or exists (select 1 from categories c where c.id = category_id and c.household_id = products.household_id)
  )
);

create policy "members can delete archived products without purchase history" on products
for delete
using (
  private.is_household_member(household_id)
  and archived = true
  and not exists (select 1 from purchase_items pi where pi.product_id = products.id)
);
