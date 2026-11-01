import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { StockTabs } from "./stock-tabs";

export default async function StockPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();

  const [
    { data: products },
    { data: stock },
    { data: categories },
    { data: expirations },
    { data: replenishment },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, unit_label, category_id, low_stock_threshold, restock_cycle_days, needs_restock",
      )
      .eq("household_id", household.id)
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("product_stock")
      .select("product_id, quantity_on_hand")
      .eq("household_id", household.id),
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("household_id", household.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_expirations_upcoming")
      .select(
        "id, product_name, unit_label, expiration_date, quantity, days_until, level, purchase_item_id, confirmed_by_user",
      )
      .eq("household_id", household.id),
    // "Hace cuanto no lo comprás" (Fase 8, restock_cycle_days): se lee acá
    // en vez de recalcularlo en el cliente para no duplicar la lógica de
    // la vista product_replenishment. cycle_urgency (Fase 29) trae la
    // franja de anticipo (vencido/esta_semana/proxima_semana) para que
    // Stock avise con margen, no solo cuando el ciclo ya se cumplió al
    // 100% -- sin tocar quantity_on_hand (ver docs/plan.md: pedido de
    // resetear stock a 0 automáticamente al vencer el ciclo, descartado
    // por fabricar una cantidad que no es real -- el ciclo solo alimenta
    // la alerta).
    supabase
      .from("product_replenishment")
      .select("product_id, restock_reason, cycle_urgency, restock_snoozed_until, last_restocked_at")
      .eq("household_id", household.id),
  ]);

  const stockByProduct = new Map(
    (stock ?? []).map((s) => [s.product_id, s.quantity_on_hand ?? 0]),
  );
  // cycle_urgency solo viaja para productos con motivo 'ciclo_de_compra':
  // 'vencido'/'esta_semana' son los mismos que antes disparaban should_restock
  // (ahora con margen), 'proxima_semana' es puramente informativo, no
  // dispara nada -- Stock lo muestra aparte, más suave. restock_snoozed_until
  // (Fase 30) es la fecha hasta la que la persona pidió no ser molestada con
  // sugerencias automáticas de este producto (ciclo/predicción) -- null si
  // nunca lo pospuso o si ya venció el plazo.
  const replenishmentByProduct = new Map(
    (replenishment ?? [])
      .filter((r) => r.product_id)
      .map((r) => [
        r.product_id as string,
        {
          cycle_urgency: r.cycle_urgency,
          restock_snoozed_until: r.restock_snoozed_until,
          last_restocked_at: r.last_restocked_at,
        },
      ]),
  );

  const rows = (products ?? []).map((p) => ({
    ...p,
    quantity_on_hand: stockByProduct.get(p.id) ?? 0,
    // Fase 37: "Última compra" sale de la misma vista (max created_at con
    // reason='purchase', o sea solo compras REALES, no la carga inicial --
    // criterio de Fase 20) en vez de traer TODOS los movimientos de compra
    // del hogar y recorrerlos acá: era una consulta sin tope que crece con
    // el historial.
    last_restocked_at: replenishmentByProduct.get(p.id)?.last_restocked_at ?? null,
    cycle_urgency: replenishmentByProduct.get(p.id)?.cycle_urgency ?? null,
    restock_snoozed_until: replenishmentByProduct.get(p.id)?.restock_snoozed_until ?? null,
  }));

  // La vista product_expirations_upcoming no tiene una PK declarada para
  // PostgREST, asi que el generador de tipos marca "id" como nullable
  // aunque en la practica nunca lo es (viene de product_expirations.id,
  // NOT NULL). Se filtra por las dudas en vez de forzar el tipo a ciegas.
  const expirationRows = (expirations ?? []).filter(
    (e): e is typeof e & { id: string } => e.id !== null,
  );

  return (
    <StockTabs
      householdId={household.id}
      products={rows}
      categories={categories ?? []}
      initialExpirations={expirationRows}
    />
  );
}
