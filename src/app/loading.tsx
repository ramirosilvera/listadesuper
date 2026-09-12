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
export default function Loading() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 py-[max(4rem,env(safe-area-inset-top))] dark:bg-black"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-[#16A34A] text-white">
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
      <p className="text-sm text-zinc-400">Cargando…</p>
    </div>
  );
}
