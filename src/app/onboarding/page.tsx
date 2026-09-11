import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { user, household } = await getActiveHousehold();

  if (!user) redirect("/login");
  if (household) redirect("/lista");

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 py-[max(4rem,env(safe-area-inset-top))] text-center dark:bg-black"
      style={{
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Armemos tu hogar
        </h1>
        <p className="mt-2 max-w-sm text-zinc-600 dark:text-zinc-400">
          Creá un hogar nuevo, o unite a uno existente con el código que te
          pasó quien ya lo creó.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
