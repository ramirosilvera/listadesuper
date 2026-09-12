import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { AjustesClient } from "./ajustes-client";

export default async function AjustesPage() {
  const { user, household } = await getActiveHousehold();
  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  const supabase = await createClient();
  const [{ data: members }, { data: archivedProducts }] = await Promise.all([
    supabase
      .from("household_members")
      .select("user_id, role, joined_at")
      .eq("household_id", household.id)
      .order("joined_at", { ascending: true }),
    supabase
      .from("products")
      .select("id, name")
      .eq("household_id", household.id)
      .eq("archived", true)
      .order("name", { ascending: true }),
  ]);

  // Solo se puede eliminar (borrado real, no archivar) un producto
  // archivado que nunca tuvo una compra real registrada -- si la tuvo,
  // borrarlo en cascada se llevaría puesto ese gasto histórico de
  // Reportes (misma policy de RLS que lo impide a nivel de base). Se
  // calcula acá para no ofrecer el botón de eliminar en un caso que de
  // todos modos la base va a rechazar.
  const archivedIds = (archivedProducts ?? []).map((p) => p.id);
  const { data: purchasedArchived } = archivedIds.length
    ? await supabase.from("purchase_items").select("product_id").in("product_id", archivedIds)
    : { data: [] as { product_id: string }[] };
  const idsWithRealPurchases = new Set((purchasedArchived ?? []).map((r) => r.product_id));

  const archivedProductsWithFlag = (archivedProducts ?? []).map((p) => ({
    ...p,
    hasRealPurchases: idsWithRealPurchases.has(p.id),
  }));

  return (
    <AjustesClient
      household={household}
      userEmail={user.email ?? ""}
      memberCount={members?.length ?? 1}
      archivedProducts={archivedProductsWithFlag}
    />
  );
}
