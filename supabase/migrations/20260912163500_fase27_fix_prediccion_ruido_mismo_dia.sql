-- Fase 27: bug real reportado por el usuario -- "Aceite de oliva genérico"
-- aparecía como "se está por acabar" aunque el umbral de aviso estaba en 0
-- y el stock mostraba 1 unidad. El usuario sospechó que tenía que ver con
-- haber cambiado las unidades de varios productos (aceite de oliva a
-- "500 cc", quesos a "500 g", etc.) -- se verificó contra los datos
-- reales y esa hipótesis era incorrecta: la unidad no interviene en
-- ningún cálculo de reposición.
--
-- Causa real, confirmada: avg_daily_consumption (Fase 8) exigía
-- count(delta<0) >= 2 en 90 días, pero dividía por
-- greatest(1, dias_transcurridos). Sobre "Aceite de oliva genérico" había
-- 3 pares "-1 then +1" tocados el mismo día (probando el stepper de
-- cantidad de Stock en distintas rondas de esta sesión) -- la cuenta de
-- eventos "-1" no distingue un ajuste que se revirtió al toque de un
-- consumo real sostenido en el tiempo. Resultado: avg_daily_consumption =
-- 3 / greatest(1, 0) = 3 unidades por día, sobre un producto cuya
-- cantidad neta nunca cambió (arrancó y sigue en 1).
--
-- Arreglo: exigir un mínimo de 3 días reales entre el primer evento de
-- consumo detectado y ahora antes de confiar en la predicción. Verificado
-- contra los datos reales tras aplicar: avg_daily_consumption pasa a null
-- para "Aceite de oliva genérico" y should_restock a false -- sin tocar
-- ningún dato histórico (es una vista, se recalcula sola).
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
    when p.needs_restock then 'marcado_manual'
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
      when count(*) filter (where sm.delta < 0) >= 2
        and extract(day from now() - min(sm.created_at) filter (where sm.delta < 0)) >= 3
      then
        coalesce(sum(-sm.delta) filter (where sm.delta < 0), 0)
        / greatest(3, least(90, extract(day from now() - min(sm.created_at) filter (where sm.delta < 0))))
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
