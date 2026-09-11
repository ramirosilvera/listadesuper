import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { StockClient } from "./stock-client";

export default async function StockPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();

  const [{ data: products }, { data: stock }, { data: categories }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, unit_label, category_id")
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
    ]);

  const stockByProduct = new Map(
    (stock ?? []).map((s) => [s.product_id, s.quantity_on_hand ?? 0]),
  );

  const rows = (products ?? []).map((p) => ({
    ...p,
    quantity_on_hand: stockByProduct.get(p.id) ?? 0,
  }));

  return (
    <StockClient
      householdId={household.id}
      products={rows}
      categories={categories ?? []}
    />
  );
}
