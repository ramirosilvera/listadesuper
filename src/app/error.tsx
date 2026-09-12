"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

// Boundary de errores a nivel raíz (Fase 18, auditoría pre-publicación):
// no existía ninguno en toda la app. Sin esto, cualquier excepción no
// controlada (ej. lista/page.tsx tira un Error explícito si falla crear
// la lista activa) dejaba a la persona en la pantalla genérica de error
// de Next -- sin nav, sin marca, sin ninguna salida clara. Cubre todo lo
// que cuelga del layout raíz salvo el layout raíz en sí (para eso hace
// falta global-error.tsx, que reemplaza también <html>/<body> -- no se
// agregó porque el layout raíz no hace nada que pueda tirar: no tiene
// ningún await ni lógica propia, ver src/app/layout.tsx).
//
// "retry" (no "reset"): re-intenta re-buscar y re-renderizar lo que
// falló, no solo limpiar el estado de error localmente -- lo correcto
// para reintentar una compra a mitad de camino, no solo esconder el
// error.
export default function GlobalErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 py-[max(4rem,env(safe-area-inset-top))] text-center dark:bg-black"
      style={{
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Algo salió mal
        </h1>
        <p className="mt-2 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          No pudimos mostrar esta pantalla. Probá de nuevo — si sigue
          pasando, volvé a Lista y contanos qué estabas haciendo.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button onClick={() => retry()} className="w-full">
          Reintentar
        </Button>
        <Link href="/" className="block">
          <Button variant="secondary" className="w-full">
            Ir al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
