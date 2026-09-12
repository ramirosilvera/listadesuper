-- Fase 20: distinguir vencimientos "estimados" (creados por
-- seed_initial_stock en la Fase 6, sin una compra real detrás) de
-- vencimientos confirmados, para que la pantalla de Vencimientos pueda
-- avisar "aprox." en vez de mostrar una fecha adivinada como si fuera un
-- hecho. Pedido: que la esposa (escéptica de la app) no lea datos de
-- arranque como errores de la app, sino como un punto de partida editable.

-- 1) Exponer purchase_item_id en la vista para poder distinguir en el
--    cliente "viene de una compra real" (purchase_item_id no nulo) de
--    "fue estimado al cargar el stock inicial" (purchase_item_id nulo).
--    CREATE OR REPLACE VIEW solo permite agregar columnas al final del
--    SELECT list en Postgres, no reordenar ni insertar en el medio.
create or replace view product_expirations_upcoming
with (security_invoker = true) as
select
  pe.id,
  pe.household_id,
  pe.product_id,
  p.name as product_name,
  p.unit_label,
  pe.expiration_date,
  pe.quantity,
  (pe.expiration_date - current_date) as days_until,
  case
    when pe.expiration_date < current_date then 'expired'
    when pe.expiration_date - current_date <= 2 then 'red'
    when pe.expiration_date - current_date <= 7 then 'amber'
    else 'green'
  end as level,
  pe.purchase_item_id
from product_expirations pe
join products p on p.id = pe.product_id
where pe.status = 'active' and p.archived = false
order by pe.expiration_date asc;

-- 2) confirmed_by_user: sin esta columna, editar a mano una fecha
--    estimada NO limpia purchase_item_id (que sigue nulo), así que la
--    etiqueta "aprox." quedaría pegada para siempre incluso después de
--    que alguien la corrija -- justo el efecto contrario al buscado.
alter table product_expirations
  add column confirmed_by_user boolean not null default false;

-- 3) Reemplazar la vista una segunda vez para exponer también
--    confirmed_by_user (de nuevo, agregado al final por la misma
--    restricción de Postgres). Esta es la definición final y vigente.
create or replace view product_expirations_upcoming
with (security_invoker = true) as
select
  pe.id,
  pe.household_id,
  pe.product_id,
  p.name as product_name,
  p.unit_label,
  pe.expiration_date,
  pe.quantity,
  (pe.expiration_date - current_date) as days_until,
  case
    when pe.expiration_date < current_date then 'expired'
    when pe.expiration_date - current_date <= 2 then 'red'
    when pe.expiration_date - current_date <= 7 then 'amber'
    else 'green'
  end as level,
  pe.purchase_item_id,
  pe.confirmed_by_user
from product_expirations pe
join products p on p.id = pe.product_id
where pe.status = 'active' and p.archived = false
order by pe.expiration_date asc;
