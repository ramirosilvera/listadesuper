-- Fase 18 (auditoría integral pre-publicación): limpieza de dos hallazgos
-- menores de mcp__Supabase__get_advisors (performance), ninguno grave,
-- pero una auditoría pre-lanzamiento es el momento de dejarlos en cero.
--
-- 1) "members can view dismissals" (SELECT) quedó redundante con
--    "members can manage dismissals" (ALL, agregada en Fase 12 con la
--    misma condición) desde que se le sumó el chequeo cruzado de
--    product_id -- Postgres evalúa las DOS policies en cada SELECT sin
--    que aporte nada la segunda. Se borra la redundante.
-- 2) product_suggestion_dismissals.dismissed_by (FK a auth.users) no
--    tenía índice de cobertura -- se agrega, mismo criterio que ya usan
--    el resto de las FKs de esta tabla.
drop policy "members can view dismissals" on product_suggestion_dismissals;

create index product_suggestion_dismissals_dismissed_by_idx
  on product_suggestion_dismissals (dismissed_by);
