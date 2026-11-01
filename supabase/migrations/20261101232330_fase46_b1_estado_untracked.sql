-- Fase 46, b1: estado 'untracked' (= "dejó de controlarse") en product_expirations.
-- No se reutiliza 'discarded' porque resolve_expiration(..., 'discarded') además
-- descuenta stock (significa "lo tiré por vencido").
alter table product_expirations drop constraint product_expirations_status_check;
alter table product_expirations add constraint product_expirations_status_check
  check (status in ('active', 'consumed', 'discarded', 'untracked'));
