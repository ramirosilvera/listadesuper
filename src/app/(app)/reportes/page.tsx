import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { ReportesTabs } from "./reportes-tabs";
import type { ProductSuggestion } from "./suggestions-panel";

export default async function ReportesPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();

  const [
    { data: topProducts },
    { data: expirationsUpcoming },
    { data: replenishment },
    { data: purchases },
    { data: suggestions },
    { data: householdMembers },
    { data: seen },
  ] = await Promise.all([
    supabase
      .from("top_products_90d")
      .select("product_id, product_name, purchase_count")
      .eq("household_id", household.id)
      .order("purchase_count", { ascending: false })
      .limit(5),
    supabase
      .from("product_expirations_upcoming")
      .select("id, level")
      .eq("household_id", household.id),
    supabase
      .from("product_replenishment")
      .select("product_id, should_restock")
      .eq("household_id", household.id)
      .eq("should_restock", true),
    // "Historial": no existe un concepto de "lista semanal" propio (la
    // lista compartida es una sola, continua) — cada fila de purchases
    // es lo más parecido a "la compra de esa semana", así que es lo que
    // se muestra como historial.
    supabase
      .from("purchases")
      .select(
        "id, purchased_at, created_by, stores(name), purchase_items(id, quantity, products(name, unit_label))",
      )
      .eq("household_id", household.id)
      .order("purchased_at", { ascending: false })
      .limit(30),
    supabase
      .from("product_suggestions")
      .select("product_id, name, suggestion_type, current_value, suggested_value, evidence_count, reason")
      .eq("household_id", household.id)
      .order("suggestion_type", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("household_members").select("user_id").eq("household_id", household.id),
    // Fase 34: qué sugerencias ya vio ESTA persona -- personal, no por
    // hogar (product_suggestion_dismissals ya cubre "el hogar decidió
    // ignorar esto"; esto es solo "yo ya lo miré").
    supabase
      .from("suggestion_seen")
      .select("product_id, suggestion_type, suggested_value")
      .eq("household_id", household.id)
      .eq("user_id", user.id),
  ]);

  // Nombres de quienes integran el hogar (Fase 32) -- para mostrar "quién"
  // registró cada compra en Historial y en el export JSON, en vez de un id
  // interno. profiles no tiene household_id propio (una persona pertenece a
  // un solo hogar a la vez), así que se filtra por los ids de
  // household_members en vez de poder pedirlo con un solo select anidado.
  const { data: members } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", (householdMembers ?? []).map((m) => m.user_id));

  const urgentExpirations = (expirationsUpcoming ?? []).filter(
    (e) => e.level === "expired" || e.level === "red",
  ).length;

  const validSuggestions = (suggestions ?? [])
    .filter((s) => s.product_id && s.name && s.suggestion_type && s.reason)
    .map((s) => s as unknown as ProductSuggestion);

  // Fase 34: "sin leer" = sugerencia vigente que no está en suggestion_seen
  // de esta persona. La identidad de una sugerencia es
  // product_id+suggestion_type+suggested_value (mismo criterio que usa
  // mark_suggestions_seen, incluido el sentinel -1 para 'archivar', que no
  // tiene valor propio).
  const seenKeys = new Set(
    (seen ?? []).map((s) => `${s.product_id}:${s.suggestion_type}:${s.suggested_value}`),
  );
  const unreadSuggestions = validSuggestions.filter(
    (s) => !seenKeys.has(`${s.product_id}:${s.suggestion_type}:${s.suggested_value ?? -1}`),
  ).length;

  return (
    <ReportesTabs
      householdId={household.id}
      householdName={household.name}
      members={members ?? []}
      topProducts={topProducts ?? []}
      urgentExpirations={urgentExpirations}
      restockCount={(replenishment ?? []).length}
      purchases={purchases ?? []}
      suggestions={validSuggestions}
      unreadSuggestions={unreadSuggestions}
    />
  );
}
