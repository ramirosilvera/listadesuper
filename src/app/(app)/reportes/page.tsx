import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { ReportesTabs } from "./reportes-tabs";

export default async function ReportesPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();

  const [
    { data: byCategory },
    { data: byWeek },
    { data: topProducts },
    { data: expirationsUpcoming },
    { data: replenishment },
    { data: purchases },
  ] = await Promise.all([
    supabase
      .from("spending_by_category_30d")
      .select("category_id, category_name, total_amount, item_count")
      .eq("household_id", household.id),
    supabase
      .from("spending_by_week")
      .select("week_start, total_amount")
      .eq("household_id", household.id),
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
        "id, purchased_at, total_amount, stores(name), purchase_items(id, quantity, unit_price, subtotal, products(name, unit_label))",
      )
      .eq("household_id", household.id)
      .order("purchased_at", { ascending: false })
      .limit(30),
  ]);

  const totalSpend30d = (byCategory ?? []).reduce(
    (sum, c) => sum + (c.total_amount ?? 0),
    0,
  );
  const urgentExpirations = (expirationsUpcoming ?? []).filter(
    (e) => e.level === "expired" || e.level === "red",
  ).length;

  return (
    <ReportesTabs
      totalSpend30d={totalSpend30d}
      byCategory={byCategory ?? []}
      byWeek={byWeek ?? []}
      topProducts={topProducts ?? []}
      urgentExpirations={urgentExpirations}
      restockCount={(replenishment ?? []).length}
      purchases={purchases ?? []}
    />
  );
}
