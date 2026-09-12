-- Fase 29: reemplaza el disparador binario de restock_cycle_days
-- ("¿ya se cumplió el ciclo, sí o no?") por franjas de urgencia
-- (vencido / esta_semana / proxima_semana), calculadas como "cuántos días
-- faltan para el próximo ciclo esperado" en vez de "¿se cumplió al 100%?".
--
-- Motivo (/consejo con el usuario, roles Datos/Arquitectura + UX +
-- Pragmático): el usuario compra semanalmente pero no cada 7 días exactos
-- -- a veces un poco menos, un poco más. El umbral binario de antes no
-- tenía margen: con cycle_days=7, si pasaban 6 días y 23hs no avisaba
-- nada, recién al día 7 pasaba de "nada" a "hace tiempo no lo comprás".
-- El usuario había parchado esto bajando manualmente 7->5 y 14->10 días
-- (Fase de esta misma sesión) para adelantar el aviso, pero eso no es
-- escalable a los ciclos largos (21, 28, 90, 180 días, donde restar unos
-- días fijos no tiene el mismo efecto relativo) y deja el número de
-- configuración mintiendo sobre el ciclo real.
--
-- Con franjas, el margen queda incorporado en la categoría en vez de en
-- el número: cualquier ciclo (corto o largo) entra en "esta_semana"
-- cuando faltan <=6 días para cumplirse, sin importar su longitud total.
-- Por eso esta migración también revierte los productos que se habían
-- bajado a 5/10 días de vuelta a sus ciclos reales (7/14) -- confirmado
-- contra los datos reales antes de tocar nada: siguen siendo exactamente
-- los mismos 9 (en 5) y 11 (en 10) que se cambiaron entonces, nadie los
-- tocó desde Stock en el medio.
update products
set restock_cycle_days = case restock_cycle_days when 5 then 7 when 10 then 14 end
where archived = false and restock_cycle_days in (5, 10);

-- cycle_urgency es un campo NUEVO, independiente de restock_reason/
-- should_restock (que siguen existiendo igual que antes, por
-- compatibilidad) -- solo describe la urgencia del ciclo de compra en
-- particular, sin mezclarse con marcado_manual/predicción/umbral (esos
-- tres siguen siendo "hay que reponer YA" sin franja, tal como estaban).
-- should_restock/restock_reason='ciclo_de_compra' ahora también disparan
-- en 'esta_semana' (antes solo en 'vencido' == el ciclo ya cumplido al
-- 100%) -- ese es el cambio de comportamiento real que resuelve el
-- problema planteado. 'proxima_semana' es solo informativo: no dispara
-- should_restock (no se mezcla como sugerido en Lista/Comprar), se
-- muestra aparte en Stock como aviso suave.
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
      and (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 6
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
      and (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 6
      then 'ciclo_de_compra'
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
    when p.restock_cycle_days is not null and last_restock.last_restocked_at is not null then
      case
        when (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 0
          then 'vencido'
        when (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 6
          then 'esta_semana'
        when (p.restock_cycle_days - extract(day from now() - last_restock.last_restocked_at)::int) <= 13
          then 'proxima_semana'
        else null
      end
    else null
  end as cycle_urgency
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
