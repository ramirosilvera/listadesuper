import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";

export default async function Home() {
  const { user, household } = await getActiveHousehold();

  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");
  redirect("/lista");
}
