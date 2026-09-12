-- Fase 8: reponer no solo por stock, tambien por "hace cuanto no lo
-- compramos" segun el habito de cada producto. Pedido explicito del
-- usuario: aceite de oliva se compra 1 vez por mes, asi que un umbral de
-- stock (avisar con <=1) no tiene sentido para ese producto — lo que
-- importa es cuanto tiempo paso desde la ultima vez que entro a la casa,
-- no cuantas unidades quedan. Es un control ADICIONAL a los dos que ya
-- existian (umbral manual de stock, prediccion automatica por consumo
-- real): sirve especificamente para cuando el stock no se actualiza a
-- mano y el unico rastro real es "cuando fue la ultima compra".
--
-- "Ultima compra" se toma de stock_movements con delta positivo (reason
-- 'purchase' o 'initial_load'), no de una tabla de compras separada:
-- ya es la fuente que usa avg_daily_consumption mas abajo, evita otro
-- join, y cubre tambien la carga inicial de Fase 6 (que es, a todo
-- efecto practico, "como si hubieramos comprado esto hoy").
--
-- Nota tecnica: create or replace view no permite reordenar ni insertar
-- columnas en medio de las existentes (solo agregar al final), asi que
-- las columnas nuevas van todas al final del select.

alter table products add column restock_cycle_days int;

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
    when calc.avg_daily_consumption > 0
      and coalesce(ps.quantity_on_hand, 0) / calc.avg_daily_consumption <= 3
      then true
    when p.low_stock_threshold is not null
      and coalesce(ps.quantity_on_hand, 0) <= p.low_stock_threshold
      then true
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and now() - last_restock.last_restocked_at >= make_interval(days => p.restock_cycle_days)
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
    when p.restock_cycle_days is not null
      and last_restock.last_restocked_at is not null
      and now() - last_restock.last_restocked_at >= make_interval(days => p.restock_cycle_days)
      then 'ciclo_de_compra'
    else null
  end as restock_reason,
  p.restock_cycle_days,
  last_restock.last_restocked_at,
  case
    when last_restock.last_restocked_at is not null
      then extract(day from now() - last_restock.last_restocked_at)::int
    else null
  end as days_since_last_restock
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
left join lateral (
  select max(sm2.created_at) as last_restocked_at
  from stock_movements sm2
  where sm2.product_id = p.id
    and sm2.household_id = p.household_id
    and sm2.delta > 0
) last_restock on true
where p.archived = false;
