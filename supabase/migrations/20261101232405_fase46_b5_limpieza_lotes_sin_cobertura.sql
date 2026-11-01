-- Fase 46, b5: en los productos controlados, los lotes que el stock ya no cubre
-- (FIFO: se asume que se consume primero lo más viejo) pasan a 'consumed'.
with ranked as (
  select pe.id, pe.quantity, coalesce(ps.quantity_on_hand, 0) as stock,
    sum(pe.quantity) over (partition by pe.product_id order by pe.created_at desc, pe.id) as cum
  from product_expirations pe
  join products p on p.id = pe.product_id
  left join product_stock ps on ps.product_id = pe.product_id
  where pe.status = 'active' and p.track_expiration
)
update product_expirations pe set status = 'consumed'
from ranked r
where pe.id = r.id and (r.cum - r.quantity) >= r.stock;
