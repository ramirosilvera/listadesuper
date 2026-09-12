-- Fase 28: la app dejó de pedir/mostrar precio de compra en todos lados
-- (Comprar, Reportes, Historial, export) -- decisión del usuario, no lo
-- iba a usar. Se verificó contra los datos reales antes de tocar nada:
-- ninguna de las 27 purchase_items ni de las 27 purchases del único hogar
-- real tenía unit_price/subtotal/total_amount cargado (siempre quedó en
-- blanco), así que no hay ninguna fila que "vaciar" -- lo único que queda
-- para sacar es la infraestructura de reportes de gasto, que ya no tiene
-- ningún consumidor en el código de la app.
--
-- Se borran las dos vistas (sin dependientes, verificado con pg_depend).
-- Las columnas unit_price/subtotal/total_amount y el parámetro opcional
-- de record_purchase se dejan como están: seguirían aceptando un precio
-- si alguna vez se vuelve a cargar desde otro lado (ej. un import), y no
-- hay ningún beneficio real en romper esa flexibilidad para borrar
-- columnas que ya están vacías.
drop view if exists spending_by_category_30d;
drop view if exists spending_by_week;
