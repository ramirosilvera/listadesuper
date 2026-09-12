import { Suspense } from "react";
import { CartLogo } from "@/components/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center bg-zinc-50 py-[max(4rem,env(safe-area-inset-top))] dark:bg-black"
      style={{
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
      <CartLogo className="h-14 w-14" iconClassName="h-8 w-8" />
      <h1 className="font-display mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        ListaSuper
      </h1>

      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
