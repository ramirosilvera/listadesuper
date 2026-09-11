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

  const [{ data: checkedItems }, { data: products }, { data: stores }] =
    await Promise.all([
      activeListIds.length
        ? supabase
            .from("shopping_list_items")
            .select("id, quantity, product_id, products(id, name, unit_label)")
            .eq("checked", true)
            .in("list_id", activeListIds)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("products")
        .select("id, name, unit_label")
        .eq("household_id", household.id)
        .eq("archived", false)
        .order("name", { ascending: true }),
      supabase
        .from("stores")
        .select("id, name")
        .eq("household_id", household.id)
        .order("name", { ascending: true }),
    ]);

  return (
    <ComprarClient
      householdId={household.id}
      initialItems={checkedItems ?? []}
      allProducts={products ?? []}
      stores={stores ?? []}
    />
  );
}
