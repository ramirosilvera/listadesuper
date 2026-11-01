-- Fase 46, b4: limpieza. Los lotes activos de productos NO controlados (216
-- estimaciones automáticas, solo 1 confirmada por una persona) pasan a
-- 'untracked'. No se borra nada; es reversible.
update product_expirations pe set status = 'untracked'
from products p
where p.id = pe.product_id and pe.status = 'active' and not p.track_expiration;
