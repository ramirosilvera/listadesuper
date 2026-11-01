-- Fase 44 (paso intermedio, ya aplicado): columnas donde el ítem de la lista
-- recuerda cuánto stock se dejó en 0 al agregarlo y qué movimiento lo hizo.
-- Aditivo: nada las usa hasta el paso 2 (triggers).
alter table shopping_list_items
  add column if not exists stock_zeroed_qty numeric,
  add column if not exists stock_zero_movement_id uuid references stock_movements(id) on delete set null;
