-- Fase 46, b6: product_expirations_upcoming solo muestra productos controlados
-- (y con stock, ver Fase 45).
create or replace view product_expirations_upcoming
  with (security_invoker = true)
as
select pe.id,
  pe.household_id,
  pe.product_id,
  p.name as product_name,
  p.unit_label,
  pe.expiration_date,
  pe.quantity,
  pe.expiration_date - current_date as days_until,
  case
    when pe.expiration_date < current_date then 'expired'::text
    when (pe.expiration_date - current_date) <= 2 then 'red'::text
    when (pe.expiration_date - current_date) <= 7 then 'amber'::text
    else 'green'::text
  end as level,
  pe.purchase_item_id,
  pe.confirmed_by_user
from product_expirations pe
join products p on p.id = pe.product_id
left join product_stock ps on ps.product_id = pe.product_id and ps.household_id = pe.household_id
where pe.status = 'active'
  and p.archived = false
  and p.track_expiration
  and coalesce(ps.quantity_on_hand, 0) > 0
order by pe.expiration_date;
