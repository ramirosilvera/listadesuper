import { createClient } from "@/lib/supabase/server";

// MVP: un usuario pertenece a un solo hogar activo (el primero que
// integra). Multi-hogar por usuario queda para más adelante si hace
// falta; el modelo de datos ya lo soporta sin cambios.
export async function getActiveHousehold() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, household: null };

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, role, households(id, name, invite_code)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || !membership.households) {
    return { user, household: null };
  }

  return {
    user,
    household: {
      id: membership.households.id,
      name: membership.households.name,
      invite_code: membership.households.invite_code,
      role: membership.role,
    },
  };
}
