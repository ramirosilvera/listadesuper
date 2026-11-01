-- Fase 39: auditoría del repaso de stock (/consejo).
--
-- Bug reproducido contra la base: el repaso (Fase 38) calculaba el delta en
-- el navegador con la cantidad que tenía al cargar la pantalla. Si en el
-- medio alguien bajaba el stock desde Stock con el "-", "No queda" escribía
-- un delta de más y el stock quedaba NEGATIVO (prueba: figuraba 2, se
-- consumió 1, "No queda" -> stock real -1). Y "Queda" con una cantidad
-- vieja podía subir el stock sin querer.
--
-- Fix: el conteo es ABSOLUTO y se resuelve en la base, atómicamente, contra
-- el stock real de ese instante. p_quantity null = "Queda" (confirmar lo
-- que figura, sin cambiar la cantidad; si por algún motivo estuviera
-- negativo lo lleva a 0). Bloquea la fila del producto para que dos conteos
-- simultáneos no se pisen. Rechaza cantidades negativas o NaN.
create or replace function set_stock_count(
  p_household_id uuid,
  p_product_id uuid,
  p_quantity numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_prev numeric;
  v_new numeric;
  v_delta numeric;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  perform 1 from products
  where id = p_product_id and household_id = p_household_id
  for update;
  if not found then
    raise exception 'el producto no pertenece a este hogar';
  end if;

  if p_quantity is not null and (p_quantity < 0 or p_quantity = 'NaN'::numeric) then
    raise exception 'cantidad invalida';
  end if;

  select coalesce(sum(delta), 0) into v_prev
  from stock_movements
  where product_id = p_product_id and household_id = p_household_id;

  v_new := coalesce(p_quantity, greatest(v_prev, 0));
  v_delta := v_new - v_prev;

  insert into stock_movements (household_id, product_id, delta, reason, created_by)
  values (p_household_id, p_product_id, v_delta, 'count', auth.uid());

  return jsonb_build_object(
    'previous_quantity', v_prev,
    'new_quantity', v_new,
    'delta', v_delta
  );
end;
$function$;

revoke execute on function set_stock_count(uuid, uuid, numeric) from public, anon;
grant execute on function set_stock_count(uuid, uuid, numeric) to authenticated;
