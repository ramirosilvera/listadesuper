-- Atiende los hallazgos de performance del linter de Supabase sobre la
-- migracion base de households:
--
-- 1) auth_rls_initplan: las policies que llaman a auth.uid() directamente
--    (no a traves de is_household_member(), que ya esta bien) lo
--    reevaluan por cada fila. Se envuelve en `(select auth.uid())` para
--    que el planner lo trate como una sola evaluacion por query.
-- 2) unindexed_foreign_keys: household_members.user_id y
--    households.created_by no tenian indice propio.

alter policy "authenticated users can create a household"
  on households
  with check ((select auth.uid()) = created_by);

alter policy "owners can update their household"
  on households
  using (
    exists (
      select 1
      from household_members
      where household_id = households.id
        and user_id = (select auth.uid())
        and role = 'owner'
    )
  );

alter policy "owners can add members"
  on household_members
  with check (
    exists (
      select 1
      from household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = (select auth.uid())
        and hm.role = 'owner'
    )
  );

alter policy "members can leave, owners can remove members"
  on household_members
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = (select auth.uid())
        and hm.role = 'owner'
    )
  );

create index if not exists household_members_user_id_idx on household_members (user_id);
create index if not exists households_created_by_idx on households (created_by);
