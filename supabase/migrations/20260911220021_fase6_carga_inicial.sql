-- Fase 6: carga inicial de stock + sugerencias de reposicion en Comprar.
--
-- record_purchase (Fase 2) ya calcula la fecha de vencimiento sola a partir
-- de default_shelf_life_days cuando no viene una explicita, asi que ese
-- circuito no necesita cambios. Lo que falta es un punto de partida: si el
-- usuario recien esta armando el catalogo, no hay compras historicas que
-- hayan generado product_expirations ni stock_movements todavia, y la
-- app arranca "vacia" (stock en 0, sin vencimientos) aunque en la practica
-- ya tenga todo eso en la alacena. seed_initial_stock cubre ese bootstrap:
-- una carga inicial "como si se hubiera comprado todo hoy" (1 unidad por
-- producto, vencimiento = hoy + default_shelf_life_days donde se conoce),
-- editable despues por los canales que ya existen (+/- en Stock, y ahora
-- tambien edicion directa de fecha en Vencimientos).
--
-- Idempotente por diseño (igual que importSeedCatalog): solo llena huecos
-- (productos sin ningun stock_movement todavia / sin vencimiento activo),
-- asi que se puede volver a correr sin duplicar nada si se suman productos
-- nuevos al catalogo mas adelante.

alter table stock_movements drop constraint stock_movements_reason_check;
alter table stock_movements add constraint stock_movements_reason_check
  check (reason in ('purchase', 'consumption', 'manual_adjust', 'expired_discard', 'initial_load'));

create or replace function seed_initial_stock(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_seeded int := 0;
  v_expirations_seeded int := 0;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  insert into stock_movements (household_id, product_id, delta, reason, created_by)
  select p_household_id, p.id, 1, 'initial_load', auth.uid()
  from products p
  where p.household_id = p_household_id
    and p.archived = false
    and not exists (
      select 1 from stock_movements sm where sm.product_id = p.id
    );
  get diagnostics v_stock_seeded = row_count;

  insert into product_expirations (household_id, product_id, expiration_date, quantity)
  select p_household_id, p.id, current_date + p.default_shelf_life_days, 1
  from products p
  where p.household_id = p_household_id
    and p.archived = false
    and p.default_shelf_life_days is not null
    and not exists (
      select 1 from product_expirations pe
      where pe.product_id = p.id and pe.status = 'active'
    );
  get diagnostics v_expirations_seeded = row_count;

  return jsonb_build_object(
    'stock_seeded', v_stock_seeded,
    'expirations_seeded', v_expirations_seeded
  );
end;
$$;

revoke execute on function seed_initial_stock(uuid) from public, anon;
grant execute on function seed_initial_stock(uuid) to authenticated;
