-- Fase 4: prediccion de reposicion. Modo hibrido tal como quedo acordado
-- en el plan (docs/plan.md, rol Datos/Estadistica de la revision inicial):
-- umbral manual por producto desde el dia 1, mas una prediccion automatica
-- que se activa sola apenas hay historial real de consumo (>=2 bajas de
-- stock en los ultimos 90 dias). No se llama "consumption_estimates" a
-- una tabla propia como decia el plan original: es todo derivado de
-- stock_movements, asi que una vista (siempre fresca, sin job que la
-- actualice ni riesgo de desincronizarse) es mas simple y mas correcto.

alter table products add column low_stock_threshold numeric;

-- product_replenishment: por producto, cuanto se consume por dia en
-- promedio (ventana movil de hasta 90 dias, contando CUALQUIER baja de
-- stock -ajuste manual, descarte por vencimiento- como señal real de
-- "esto se fue de casa", no solo un reason='consumption' que hoy nada
-- todavia escribe) y si conviene reponer: por prediccion automatica
-- (quedan <=3 dias al ritmo actual) o por el umbral manual si no hay
-- historial suficiente para confiar en una tasa.
create view product_replenishment
  with (security_invoker = true)
as
select
  p.id as product_id,
  p.household_id,
  p.name,
  p.unit_label,
  p.low_stock_threshold,
  coalesce(ps.quantity_on_hand, 0) as quantity_on_hand,
  calc.avg_daily_consumption,
  case
    when calc.avg_daily_consumption > 0
      then coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption
    else null
  end as estimated_days_remaining,
  case
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      then true
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      then true
    else false
  end as should_restock,
  case
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      then 'prediccion'
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      then 'umbral_manual'
    else null
  end as restock_reason
from products p
left join product_stock ps
  on ps.product_id = p.id and ps.household_id = p.household_id
left join lateral (
  select
    case
      when count(*) filter (where sm.delta < 0) >= 2 then
        coalesce(sum(-sm.delta) filter (where sm.delta < 0), 0)
        / greatest(1, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0))))
      else null
    end as avg_daily_consumption
  from stock_movements sm
  where sm.product_id = p.id
    and sm.household_id = p.household_id
    and sm.created_at >= now() - interval '90 days'
) calc on true
where p.archived = false;
