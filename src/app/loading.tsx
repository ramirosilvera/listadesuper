// Fallback de Suspense para TODO lo que cuelga del layout raíz: la
// redirección de "/" (Fase 0), el layout de (app) (que hace el mismo
// chequeo de sesión/hogar en cada navegación "fría" — entrar por primera
// vez, abrir un link, refrescar), /onboarding y /join/[codigo]. Sin este
// archivo, mientras esas Server Components esperan la consulta a
// Supabase no hay ningún <Suspense> arriba que lo cubra y el body queda
// vacío (blanco o negro según el tema del sistema) sin ningún indicio de
// que algo está pasando — justo el momento donde más se nota, porque es
// la primera pantalla que ve alguien al abrir la app.
//
// Importante: un loading.tsx puesto DENTRO de (app)/ no sirve para esto
// — Next solo envuelve con Suspense el page.js y los layouts ANIDADOS
// por debajo del loading.tsx, nunca el layout.js que vive en su misma
// carpeta (ver node_modules/next/dist/docs/.../loading.md). Por eso este
// archivo va acá, un nivel arriba, donde sí cubre a (app)/layout.tsx.
import { CartLogo } from "@/components/ui";

export default function Loading() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 py-[max(4rem,env(safe-area-inset-top))] dark:bg-black"
      aria-live="polite"
      aria-busy="true"
    >
      <CartLogo className="h-14 w-14 animate-pulse" iconClassName="h-8 w-8" />
      <p className="text-sm text-zinc-400">Cargando…</p>
    </div>
  );
}
