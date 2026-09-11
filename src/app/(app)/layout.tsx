import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { NavBar } from "./nav-bar";

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
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#16A34A] text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="m15 11-1 9" />
                <path d="m19 11-4-7" />
                <path d="M2 11h20" />
                <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" />
                <path d="M4.5 15.5h15" />
                <path d="m5 11 4-7" />
                <path d="m9 11 1 9" />
              </svg>
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">
              {household.name}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {children}
      </main>

      <NavBar />
    </div>
  );
}
