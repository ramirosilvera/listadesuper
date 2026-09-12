import { Suspense } from "react";
import { WelcomeStatus, WelcomeStatusSkeleton } from "./welcome-status";

// Pantalla de bienvenida, rearmada de cero (Fase 15) para no depender de
// ningún dato de Supabase en el primer render. Antes esta ruta hacía el
// chequeo de sesión/hogar y redirigía enseguida sin mostrar nada propio
// -- ni bienvenida para quien no tiene cuenta, ni un aterrizaje real para
// quien ya la usa a diario. Ahora es al revés: todo lo de acá arriba
// (ícono, título, bajada) es 100% estático, sin ningún `await` -- se
// pinta tan rápido como el navegador reciba el HTML, sin esperar a
// ninguna consulta. Lo único que depende de la sesión (que botón mostrar)
// vive en <WelcomeStatus>, envuelto en su propio <Suspense> para que
// nunca bloquee lo de arriba.
export default function WelcomePage() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-[max(4rem,env(safe-area-inset-top))] text-center dark:bg-black"
      style={{
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#16A34A] text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-9 w-9"
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

      <div>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          ListaSuper
        </h1>
        <p className="mt-2 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          La lista de súper que se acuerda de lo que se te vence y de lo
          que se te está por acabar.
        </p>
      </div>

      <Suspense fallback={<WelcomeStatusSkeleton />}>
        <WelcomeStatus />
      </Suspense>
    </div>
  );
}
