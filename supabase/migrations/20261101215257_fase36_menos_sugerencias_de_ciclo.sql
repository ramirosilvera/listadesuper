-- Fase 38: bajar el volumen de sugerencias de reposición (/consejo).
--
-- Problema medido contra datos reales: 33 chips activos contra ~14
-- productos comprados por semana. 30 de 33 eran 'ciclo_de_compra', con
-- tres causas:
--   a) avisaba hasta 6 días ANTES de cumplirse el ciclo;
--   b) 53 de 75 productos con ciclo tenían 0 o 1 compra registrada: el ciclo
--      es una estimación inicial, no una medición, y aun así empujaba;
--   c) no miraba el stock: avisaba con 6-9 unidades en casa.
--
-- Cambio (solo la rama 'ciclo_de_compra' de should_restock/restock_reason):
--   1) avisa recién cuando el ciclo se cumplió (días desde última compra
--      >= ciclo), sin adelantarse;
--   2) exige evidencia (>= 2 compras con reason='purchase') O stock bajo
--      (<= 1). Un ciclo estimado con una sola compra solo empuja si queda
--      poco.
-- Sin cambios: marcado manual, predicción, umbral manual, posponer, y
-- cycle_urgency (Stock sigue mostrando las franjas vencido/esta semana/
-- próxima como información; no son chips). Mismas columnas y orden.
-- Efecto simulado: ciclo 30 -> 9 alertas.
create or replace view product_replenishment
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
    when p.needs_restock then true
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      and snooze.dismissed_until is null then true
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      and snooze.dismissed_until is null then true
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 0
      and (n.purchase_count >= 2 or coalesce(ps.quantity_on_hand, 0) <= 1)
      and snooze.dismissed_until is null then true
    else false
  end as should_restock,
  case
    when p.needs_restock then 'marcado_manual'
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      and snooze.dismissed_until is null then 'prediccion'
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      and snooze.dismissed_until is null then 'umbral_manual'
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 0
      and (n.purchase_count >= 2 or coalesce(ps.quantity_on_hand, 0) <= 1)
      and snooze.dismissed_until is null then 'ciclo_de_compra'
    else null
  end as restock_reason,
  p.restock_cycle_days,
  last_restock.last_restocked_at,
  case
    when last_restock.last_restocked_at is not null
      then extract(day from now() - last_restock.last_restocked_at)::int
    else null
  end as days_since_last_restock,
  case
    when snooze.dismissed_until is not null then null
    when p.restock_cycle_days is not null and last_restock.last_restocked_at is not null then
      case
        when p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 0 then 'vencido'
        when p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 6 then 'esta_semana'
        when p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int <= 13 then 'proxima_semana'
        else null
      end
    else null
  end as cycle_urgency,
  snooze.dismissed_until as restock_snoozed_until
from products p
left join product_stock ps on ps.product_id = p.id and ps.household_id = p.household_id
left join lateral (
  select
    case
      when count(*) filter (where sm.delta < 0 and sm.reason <> 'purchase') >= 2
        and extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason <> 'purchase')) >= 3
      then coalesce(sum(-sm.delta) filter (where sm.delta < 0 and sm.reason <> 'purchase'), 0)
        / greatest(3, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0 and sm.reason <> 'purchase'))))
      else null
    end as avg_daily_consumption
  from stock_movements sm
  where sm.product_id = p.id and sm.household_id = p.household_id
    and sm.created_at >= now() - interval '90 days'
) calc on true
left join lateral (
  select max(sm2.created_at) as last_restocked_at
  from stock_movements sm2
  where sm2.product_id = p.id and sm2.household_id = p.household_id and sm2.reason = 'purchase'
) last_restock on true
left join lateral (
  select count(*) as purchase_count
  from stock_movements sm3
  where sm3.product_id = p.id and sm3.household_id = p.household_id and sm3.reason = 'purchase'
) n on true
left join lateral (
  select d.dismissed_until
  from product_suggestion_dismissals d
  where d.product_id = p.id and d.suggestion_type = 'reposicion_pospuesta' and d.dismissed_until > now()
) snooze on true
where p.archived = false;

-- Recalibrar ciclos con evidencia real (>= 4 compras, desvío de la mediana
-- >= max(3 días, 30%) -- mismo criterio que product_suggestions). Valores
-- previos, por si hay que revertir: Pizza Sibarita 7, Queso crema 7,
-- Queso para rallar 7. Medianas medidas: 10, 13 y 11 días.
update products set restock_cycle_days = 10 where name = 'Pizza Sibarita' and restock_cycle_days = 7 and not archived;
update products set restock_cycle_days = 13 where name = 'Queso crema' and restock_cycle_days = 7 and not archived;
update products set restock_cycle_days = 11 where name = 'Queso para rallar' and restock_cycle_days = 7 and not archived;
