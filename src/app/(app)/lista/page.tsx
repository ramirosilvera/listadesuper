import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { ShoppingListClient } from "./shopping-list-client";

async function getOrCreateActiveList(householdId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: created, error } = await supabase
    .from("shopping_lists")
    .insert({ household_id: householdId, created_by: user!.id })
    .select("id")
    .single();

  if (error || !created) throw new Error(error?.message ?? "no se pudo crear la lista");
  return created.id;
}

export default async function ListaPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();
  const listId = await getOrCreateActiveList(household.id);

  const [{ data: items }, { data: products }, { data: categories }, { data: replenishment }] =
    await Promise.all([
      supabase
        .from("shopping_list_items")
        .select(
          "id, quantity, checked, product_id, products(id, name, unit_label, category_id)",
        )
        .eq("list_id", listId)
        .order("created_at", { ascending: true }),
      supabase
        .from("products")
        .select("id, name, unit_label, category_id")
        .eq("household_id", household.id)
        .eq("archived", false)
        .order("name", { ascending: true }),
      supabase
        .from("categories")
        .select("id, name, sort_order")
        .eq("household_id", household.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_replenishment")
        .select("product_id, name, unit_label, restock_reason")
        .eq("household_id", household.id)
        .eq("should_restock", true),
    ]);

  const idsInList = new Set((items ?? []).map((it) => it.product_id));
  const suggestions = (replenishment ?? []).filter(
    (r) => r.product_id && !idsInList.has(r.product_id),
  );

  return (
    <ShoppingListClient
      householdId={household.id}
      listId={listId}
      userId={user.id}
      initialItems={items ?? []}
      allProducts={products ?? []}
      categories={categories ?? []}
      suggestions={suggestions}
    />
  );
}
