-- Fase 46, b2: el vencimiento es opt-in por producto, resuelto con un trigger
-- BEFORE INSERT sobre product_expirations en vez de reescribir record_purchase
-- (la función más delicada de la app; tocarla no hacía falta).
--  * Producto controlado: se registra tal cual.
--  * Producto NO controlado y la fecha es justo la estimación automática (fecha de
--    compra + vida útil por defecto): no se registra nada (return null).
--  * Producto NO controlado con una fecha distinta (escrita a mano): es una
--    decisión de la persona, el producto pasa a controlarse.
-- Cubre record_purchase y seed_initial_stock sin modificarlas.
-- Limitación: si alguien escribe a mano exactamente la fecha estimada en un
-- producto no controlado, se ignora (despreciable).
create or replace function private.product_expiration_opt_in()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_track boolean;
  v_shelf int;
  v_base date;
begin
  select p.track_expiration, p.default_shelf_life_days into v_track, v_shelf
  from products p where p.id = new.product_id;

  if v_track then
    return new;
  end if;

  select pu.purchased_at::date into v_base
  from purchase_items pi
  join purchases pu on pu.id = pi.purchase_id
  where pi.id = new.purchase_item_id;
  v_base := coalesce(v_base, current_date);

  if v_shelf is not null and new.expiration_date = v_base + v_shelf then
    return null;
  end if;

  update products set track_expiration = true where id = new.product_id;
  return new;
end;
$function$;

create trigger product_expirations_opt_in
  before insert on product_expirations
  for each row execute function private.product_expiration_opt_in();
