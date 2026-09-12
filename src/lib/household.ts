import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// MVP: un usuario pertenece a un solo hogar activo (el primero que
// integra). Multi-hogar por usuario queda para más adelante si hace
// falta; el modelo de datos ya lo soporta sin cambios.
//
// cache() de React deduplica esto dentro de un mismo request: el layout
// de (app) y la page que renderiza adentro llaman ambos a
// getActiveHousehold(), y sin esto cada navegación pagaba dos idas y
// vueltas completas en vez de una sola. No es una cache entre requests
// (no sirve para "no volver a pedir esto en la próxima visita"), es
// puntualmente para no repetir el mismo pedido dos veces dentro del
// mismo render.
//
// auth.getUser() y la consulta a `my_membership` se disparan en
// paralelo, no uno después del otro (Fase 14): antes, la consulta a
// household_members necesitaba `user.id` para armar el filtro en el
// cliente, así que tenía que esperar a que resolviera auth.getUser()
// primero. La vista `my_membership` filtra por `auth.uid()` adentro de
// la base, así que ya no depende de nada que el cliente le pase — las
// dos llamadas son independientes y pueden ir a la vez. Es la mitad del
// tiempo de red en el camino más lento de la app: la primera pantalla
// que se ve al abrir la app siempre pasa por acá.
export const getActiveHousehold = cache(async () => {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: membership },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("my_membership")
      .select("household_id, role, household_name, household_invite_code")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!user) return { user: null, household: null };

  if (!membership) {
    return { user, household: null };
  }

  // Postgres no expone en el catálogo qué columnas de una vista son
  // NOT NULL (a diferencia de una tabla), así que el generador de tipos
  // marca todo como nullable acá aunque el join interno de la vista
  // (household_members inner join households) garantice que, si hay
  // fila, estos tres campos vienen con valor siempre. invite_code sí es
  // legítimamente nullable (households.invite_code lo es en la tabla).
  return {
    user,
    household: {
      id: membership.household_id!,
      name: membership.household_name!,
      invite_code: membership.household_invite_code,
      role: membership.role!,
    },
  };
});
