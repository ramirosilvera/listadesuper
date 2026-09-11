import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { StockTabs } from "./stock-tabs";

export default async function StockPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();

  const [{ data: products }, { data: stock }, { data: categories }, { data: expirations }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, unit_label, category_id, low_stock_threshold")
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
        .select("id, product_name, unit_label, expiration_date, quantity, days_until, level")
        .eq("household_id", household.id),
    ]);

  const stockByProduct = new Map(
    (stock ?? []).map((s) => [s.product_id, s.quantity_on_hand ?? 0]),
  );

  const rows = (products ?? []).map((p) => ({
    ...p,
    quantity_on_hand: stockByProduct.get(p.id) ?? 0,
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
      expirationsCount={expirationRows.length}
      initialExpirations={expirationRows}
    />
  );
}
