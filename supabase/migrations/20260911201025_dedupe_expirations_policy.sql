-- Mismo descuido que en Fase 1 (dedupe_rls_policies): "members can view
-- expirations" y "members can manage expirations" (for all) tenian la
-- misma condicion, asi que Postgres evaluaba las dos en cada SELECT sin
-- necesidad. Se elimina la redundante.
drop policy "members can view expirations" on product_expirations;
