-- Fase 44 (paso 1 de 2): nuevo motivo de movimiento de stock 'list_zero'.
--
-- Pedido: al agregar un producto a la lista de súper, dejarlo automáticamente
-- sin stock para no cargarlo dos veces. Este paso solo AMPLÍA los motivos
-- permitidos (no cambia ningún dato ni comportamiento). 'list_zero' lo van a
-- escribir los triggers del paso 2: el que lleva el stock a 0 al agregar un
-- ítem a la lista y el que lo restituye si el ítem se quita sin comprarse.
-- No cuenta como consumo, ni como confirmación del Repaso, ni como medición
-- de ciclo (esas reglas miran 'consumption', 'purchase' y 'count').
alter table stock_movements drop constraint stock_movements_reason_check;
alter table stock_movements add constraint stock_movements_reason_check
  check (reason in ('purchase', 'consumption', 'manual_adjust', 'expired_discard', 'initial_load', 'count', 'list_zero'));
