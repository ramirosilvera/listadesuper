import { Suspense } from "react";
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#16A34A] text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
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
      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        ListaSuper
      </h1>

      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
