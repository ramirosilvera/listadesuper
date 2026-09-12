import { Suspense } from "react";
import { CartLogo } from "@/components/ui";
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
      <CartLogo className="h-16 w-16" iconClassName="h-9 w-9" />

      <div>
        <h1 className="font-display text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
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
