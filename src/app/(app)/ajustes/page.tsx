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

  return (
    <AjustesClient
      household={household}
      userEmail={user.email ?? ""}
      memberCount={members?.length ?? 1}
      archivedProducts={archivedProducts ?? []}
    />
  );
}
