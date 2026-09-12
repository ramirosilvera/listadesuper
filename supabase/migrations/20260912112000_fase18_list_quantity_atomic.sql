-- Fase 18 (auditoría, continuación): changeQuantity en Lista hacía
-- "leer cantidad actual, calcular, escribir cantidad absoluta" desde el
-- cliente -- confirmado por la revisión de confiabilidad como un lost
-- update real: dos personas del hogar tocando +/- sobre el MISMO ítem
-- casi al mismo tiempo pueden pisar el incremento de la otra (la
-- segunda escritura gana con el valor que calculó a partir de un estado
-- ya desactualizado). Mismo patrón que ya se resolvió para el stock con
-- adjust_stock (delta relativo, atómico en la base) -- se aplica la
-- misma solución acá.
create or replace function increment_list_item_quantity(
  p_item_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_new_quantity numeric;
begin
  select sl.household_id into v_household_id
  from shopping_list_items sli
  join shopping_lists sl on sl.id = sli.list_id
  where sli.id = p_item_id;

  if v_household_id is null then
    raise exception 'item no encontrado';
  end if;

  if not private.is_household_member(v_household_id) then
    raise exception 'not a member of this household';
  end if;

  update shopping_list_items
    set quantity = greatest(1, quantity + p_delta)
    where id = p_item_id
    returning quantity into v_new_quantity;

  return v_new_quantity;
end;
$$;

revoke execute on function increment_list_item_quantity(uuid, numeric) from public, anon;
grant execute on function increment_list_item_quantity(uuid, numeric) to authenticated;
alter function public.increment_list_item_quantity(uuid, numeric) set search_path = 'public', 'pg_temp';
