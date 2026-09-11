-- El linter de performance marca "multiple permissive policies": para
-- cada tabla habia una policy "can view" (solo select) Y una "can manage"
-- (for all) con exactamente la misma condicion, asi que en cada SELECT
-- Postgres evaluaba las dos sin necesidad. La de "manage" (for all) ya
-- cubre select, asi que se elimina la redundante.
drop policy "members can view categories" on categories;
drop policy "members can view products" on products;
drop policy "members can view stores" on stores;
drop policy "members can view shopping lists" on shopping_lists;
drop policy "members can view shopping list items" on shopping_list_items;
drop policy "members can view purchases" on purchases;
drop policy "members can view purchase items" on purchase_items;
