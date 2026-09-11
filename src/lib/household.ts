import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// MVP: un usuario pertenece a un solo hogar activo (el primero que
// integra). Multi-hogar por usuario queda para más adelante si hace
// falta; el modelo de datos ya lo soporta sin cambios.
//
// cache() de React deduplica esto dentro de un mismo request: el layout
// de (app) y la page que renderiza adentro llaman ambos a
// getActiveHousehold(), y sin esto cada navegación pagaba dos idas y
// vueltas completas (auth.getUser() + query a household_members) en vez
// de una sola. No es una cache entre requests (no sirve para "no volver
// a pedir esto en la próxima visita"), es puntualmente para no repetir
// el mismo pedido dos veces dentro del mismo render.
export const getActiveHousehold = cache(async () => {
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
});
