// Skeletons de carga (loading.tsx de cada ruta). Reutilizan la misma
// estructura visual que ya usan las listas reales (contenedor
// rounded-xl con filas separadas por borde) para que el "salto" al
// contenido real se sienta como un simple fade, no un cambio de layout.

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 pb-4" aria-live="polite" aria-busy="true">
      <div className="h-11 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      <ul className="shadow-soft overflow-hidden rounded-xl border border-zinc-200/70 dark:border-zinc-800">
        {Array.from({ length: rows }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-b border-zinc-100 bg-white px-3 py-3 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
          >
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
            {/*
              bg-zinc-800 (no zinc-900): contra la fila en zinc-950, zinc-900
              casi no se distingue en modo oscuro — se veía como una
              "pantalla negra" sin ningún indicio de carga.
            */}
            <span
              className="h-4 flex-1 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800"
              style={{ animationDelay: `${i * 60}ms`, maxWidth: `${70 - i * 8}%` }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
