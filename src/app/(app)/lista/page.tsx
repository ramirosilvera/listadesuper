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

  // Fase 37: todo lo que no depende de la lista activa arranca YA, en
  // paralelo con la búsqueda/creación de la lista (antes iba después, y los
  // nombres del hogar iban en una tercera etapa). Solo los ítems necesitan
  // el listId.
  const [
    listId,
    { data: products },
    { data: categories },
    { data: replenishment },
    { data: members },
  ] = await Promise.all([
    getOrCreateActiveList(household.id),
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
      .select("product_id, name, unit_label, restock_reason, days_since_last_restock")
      .eq("household_id", household.id)
      .eq("should_restock", true),
    // Nombres del hogar (Fase 32) para el badge "quién lo agregó" (Fase 33).
    // La policy RLS de profiles ya limita a uno mismo + convivientes.
    supabase.from("profiles").select("id, display_name"),
  ]);

  const { data: items } = await supabase
    .from("shopping_list_items")
    .select(
      "id, quantity, checked, product_id, added_by, products(id, name, unit_label, category_id)",
    )
    .eq("list_id", listId)
    .order("created_at", { ascending: true });

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
      members={members ?? []}
    />
  );
}
