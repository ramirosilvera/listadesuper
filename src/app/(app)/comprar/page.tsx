import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { ComprarClient } from "./comprar-client";

export default async function ComprarPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();

  const { data: activeLists } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", household.id)
    .eq("status", "active");
  const activeListIds = (activeLists ?? []).map((l) => l.id);

  const [
    { data: checkedItems },
    { data: products },
    { data: stores },
    { data: replenishment },
    { data: categories },
  ] = await Promise.all([
    activeListIds.length
      ? supabase
          .from("shopping_list_items")
          .select("id, quantity, product_id, products(id, name, unit_label, default_shelf_life_days)")
          .eq("checked", true)
          .in("list_id", activeListIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("products")
      .select("id, name, unit_label, default_shelf_life_days")
      .eq("household_id", household.id)
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("stores")
      .select("id, name")
      .eq("household_id", household.id)
      .order("name", { ascending: true }),
    supabase
      .from("product_replenishment")
      .select("product_id, name, unit_label, restock_reason, days_since_last_restock")
      .eq("household_id", household.id)
      .eq("should_restock", true),
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("household_id", household.id)
      .order("sort_order", { ascending: true }),
  ]);

  const idsAlreadyIn = new Set((checkedItems ?? []).map((it) => it.product_id));
  const suggestions = (replenishment ?? []).filter(
    (r) => r.product_id && !idsAlreadyIn.has(r.product_id),
  );

  return (
    <ComprarClient
      householdId={household.id}
      initialItems={checkedItems ?? []}
      allProducts={products ?? []}
      stores={stores ?? []}
      categories={categories ?? []}
      suggestions={suggestions}
    />
  );
}
