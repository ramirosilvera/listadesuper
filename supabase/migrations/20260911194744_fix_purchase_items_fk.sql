-- purchase_items.product_id tenia ON DELETE RESTRICT (para no perder
-- historial si alguien intentaba borrar un producto con compras), pero
-- eso choca con el borrado de un hogar completo: households -> products
-- (cascade) y households -> purchases -> purchase_items (cascade) son dos
-- caminos de cascada independientes, y Postgres no garantiza que el
-- segundo termine antes de que el primero pise el RESTRICT.
--
-- La proteccion real contra perder historial no debe ser un RESTRICT a
-- nivel de FK (que ademas rompe el caso de "borrar todo el hogar"), sino
-- la columna products.archived: la app nunca deberia hacer DELETE de un
-- producto con compras, sino marcarlo archived = true. Se cambia el FK a
-- CASCADE para que borrar un hogar sí pueda borrar todo su arbol de datos
-- de una.
alter table purchase_items drop constraint purchase_items_product_id_fkey;
alter table purchase_items
  add constraint purchase_items_product_id_fkey
  foreign key (product_id) references products (id) on delete cascade;
