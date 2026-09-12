-- Fase 7: permitir archivar (quitar del catálogo activo) un producto.
--
-- products.archived ya existia desde Fase 1 (soft delete a nivel de
-- aplicacion, con ON DELETE CASCADE en las FKs para no romper el
-- borrado en cascada de un hogar completo). Lo que faltaba era: (a) una
-- forma de activarlo desde la UI, y (b) un agujero real encontrado al
-- revisar esto: product_expirations_upcoming no filtraba por
-- products.archived, asi que un producto archivado seguia apareciendo
-- en la pestaña Vencimientos aunque ya no apareciera en Stock ni en
-- product_replenishment (esa vista si filtraba correctamente desde
-- Fase 4). Se corrige agregando el mismo filtro que ya tienen las
-- demas vistas que dependen de products.

create or replace view product_expirations_upcoming
  with (security_invoker = true)
as
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
  end as level
from product_expirations pe
join products p on p.id = pe.product_id
where pe.status = 'active'
  and p.archived = false
order by pe.expiration_date asc;
