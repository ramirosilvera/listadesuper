-- Fase 5: vistas de datos para los informes gráficos. Todo derivado de
-- purchases/purchase_items (ya poblados desde Fase 1), sin tablas nuevas.
-- security_invoker=true en ambas por la misma razon de siempre: sin esto
-- corren con los permisos de quien migro, sin RLS, y expondrian gasto de
-- otros hogares.

-- Gasto por categoria, ventana movil de 30 dias.
create view spending_by_category_30d
  with (security_invoker = true)
as
select
  pu.household_id,
  c.id as category_id,
  coalesce(c.name, 'Sin categoría') as category_name,
  sum(pi.subtotal) as total_amount,
  count(*) as item_count
from purchase_items pi
join purchases pu on pu.id = pi.purchase_id
join products p on p.id = pi.product_id
left join categories c on c.id = p.category_id
where pu.purchased_at >= now() - interval '30 days'
  and pi.subtotal is not null
group by pu.household_id, c.id, c.name
order by total_amount desc;

-- Evolucion de gasto semanal, ultimas ~12 semanas.
create view spending_by_week
  with (security_invoker = true)
as
select
  pu.household_id,
  date_trunc('week', pu.purchased_at)::date as week_start,
  sum(pu.total_amount) as total_amount,
  count(*) as purchase_count
from purchases pu
where pu.purchased_at >= now() - interval '84 days'
  and pu.total_amount is not null
group by pu.household_id, date_trunc('week', pu.purchased_at)
order by week_start asc;

-- Productos mas comprados (por cantidad de compras), ventana de 90 dias
-- -- alimenta el "top productos" del dashboard.
create view top_products_90d
  with (security_invoker = true)
as
select
  pu.household_id,
  p.id as product_id,
  p.name as product_name,
  count(*) as purchase_count,
  sum(pi.quantity) as total_quantity
from purchase_items pi
join purchases pu on pu.id = pi.purchase_id
join products p on p.id = pi.product_id
where pu.purchased_at >= now() - interval '90 days'
group by pu.household_id, p.id, p.name
order by purchase_count desc;
