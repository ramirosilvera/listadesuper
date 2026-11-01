import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { ComprarClient } from "./comprar-client";

export default async function ComprarPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();

  const [
    { data: checkedItems },
    { data: products },
    { data: stores },
    { data: replenishment },
    { data: categories },
  ] = await Promise.all([
    // Fase 39: antes eran dos etapas en serie (primero las listas activas,
    // después los ítems tildados de esas listas). El join !inner filtra por
    // la lista activa del hogar en la misma consulta -- mismo resultado,
    // una ida y vuelta menos.
    supabase
      .from("shopping_list_items")
      .select(
        "id, quantity, product_id, products(id, name, unit_label, default_shelf_life_days), shopping_lists!inner(household_id, status)",
      )
      .eq("checked", true)
      .eq("shopping_lists.household_id", household.id)
      .eq("shopping_lists.status", "active"),
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
