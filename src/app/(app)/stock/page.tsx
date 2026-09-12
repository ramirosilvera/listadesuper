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
    { data: realPurchases },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit_label, category_id, low_stock_threshold, restock_cycle_days")
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
    // Fase 20: "Última compra" solo debe mostrarse para una compra REAL
    // (reason='purchase'), no para la carga inicial de Fase 6 -- mostrar
    // "Última compra: 11/09" para algo que en realidad nunca se compró,
    // solo se cargó como punto de partida, es engañoso (ver docs/plan.md,
    // pedido de UX para que los datos de arranque se lean como estimados,
    // no como hechos confirmados).
    supabase
      .from("stock_movements")
      .select("product_id, created_at")
      .eq("household_id", household.id)
      .eq("reason", "purchase")
      .order("created_at", { ascending: false }),
  ]);

  const stockByProduct = new Map(
    (stock ?? []).map((s) => [s.product_id, s.quantity_on_hand ?? 0]),
  );
  // Ya viene ordenado desc, así que la primera ocurrencia de cada
  // product_id es su compra real más reciente.
  const lastRestockByProduct = new Map<string, string>();
  for (const m of realPurchases ?? []) {
    if (!lastRestockByProduct.has(m.product_id)) {
      lastRestockByProduct.set(m.product_id, m.created_at);
    }
  }

  const rows = (products ?? []).map((p) => ({
    ...p,
    quantity_on_hand: stockByProduct.get(p.id) ?? 0,
    last_restocked_at: lastRestockByProduct.get(p.id) ?? null,
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
