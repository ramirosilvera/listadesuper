-- Fase 37: rendimiento (/consejo).
--
-- Medido contra la base real: las vistas del motor (product_replenishment,
-- product_suggestions) ejecutan en ~2-3 ms con 309 movimientos / 128
-- productos -- el motor no es el cuello de botella. Esta migración cierra
-- los dos avisos de rendimiento del advisor que sí aplican a consultas que
-- la app hace en cada navegación:
--
-- 1) RLS initplan: auth.uid() dentro de una policy se re-evalúa por cada
--    fila. Envolverlo en (select auth.uid()) lo evalúa una sola vez por
--    consulta. Misma lógica y mismo resultado, solo cambia cuándo se
--    calcula. Afecta profiles (se lee en Lista y Reportes) y
--    suggestion_seen (se lee en Reportes).
-- 2) Índices para las dos FK de suggestion_seen que no tenían índice
--    cubriente (el borrado en cascada de un producto/hogar las recorre).
--
-- Los 21 índices "sin uso" del advisor NO se tocan: con tablas de cientos
-- de filas el planner prefiere Seq Scan, así que "sin uso" hoy no significa
-- "inútil" -- son los que van a importar cuando crezca el historial.
alter policy "ver perfiles propios o de convivientes" on public.profiles
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.household_members hm1
      join public.household_members hm2 on hm1.household_id = hm2.household_id
      where hm1.user_id = (select auth.uid()) and hm2.user_id = profiles.id
    )
  );

alter policy "actualizar el propio perfil" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "cada usuario ve y marca sus propios vistos" on public.suggestion_seen
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_household_member(household_id));

create index if not exists suggestion_seen_household_id_idx on public.suggestion_seen (household_id);
create index if not exists suggestion_seen_product_id_idx on public.suggestion_seen (product_id);
