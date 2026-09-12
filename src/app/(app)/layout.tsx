import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { CartLogo } from "@/components/ui";
import { NavBar } from "./nav-bar";
import { InstallPrompt } from "./install-prompt";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, household } = await getActiveHousehold();

  if (!user) redirect("/login");
  if (!household) redirect("/onboarding");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CartLogo className="h-8 w-8 rounded-lg" iconClassName="h-5 w-5" />
            <span className="font-display font-semibold text-zinc-900 dark:text-zinc-50">
              {household.name}
            </span>
          </div>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-2xl flex-1 py-4"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <InstallPrompt />
        {children}
      </main>

      <NavBar />
    </div>
  );
}
