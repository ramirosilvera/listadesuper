"use client";

import { useState } from "react";
import { restockReasonLabel } from "@/lib/restock";

export type RestockSuggestion = {
  product_id: string | null;
  name: string | null;
  unit_label: string | null;
  restock_reason: string | null;
  days_since_last_restock: number | null;
};

const VISIBLE_LIMIT = 8;

// Compartido por Lista ("Se están por acabar") y Comprar ("Sugeridos
// para reponer"): misma pinta, mismo comportamiento. Con umbrales y
// ciclos de compra ya cargados para buena parte del catálogo, la lista
// de sugerencias puede tener 30-40 productos — mostrarlas todas de
// entrada abruma más de lo que ayuda, así que se recorta con un
// "+N más" en vez de tirar todo junto.
export function RestockChips({
  title,
  suggestions,
  onAdd,
  onSnooze,
}: {
  title: string;
  suggestions: RestockSuggestion[];
  onAdd: (suggestion: RestockSuggestion) => void;
  onSnooze: (suggestion: RestockSuggestion) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (suggestions.length === 0) return null;

  const visible = expanded ? suggestions : suggestions.slice(0, VISIBLE_LIMIT);
  const hiddenCount = suggestions.length - visible.length;

  return (
    <div>
      <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">
        {visible.map((s) => {
          if (!s.product_id) return null;
          const label = restockReasonLabel(s.restock_reason, s.days_since_last_restock);
          return (
            // Split en dos botones hermanos (no un botón anidado en otro,
            // eso no es válido) dentro de un mismo pill: tocar el nombre
            // agrega a la lista, tocar el reloj pospone -- misma acción
            // que ya existe en Stock, ahora también donde se ve la
            // sugerencia (a pedido del usuario).
            <div
              key={s.product_id}
              className="flex items-stretch overflow-hidden rounded-full border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
            >
              <button
                type="button"
                onClick={() => onAdd(s)}
                className="flex min-h-9 select-none touch-manipulation items-center gap-1.5 px-3 text-sm text-amber-800 active:bg-amber-100 dark:text-amber-300 dark:active:bg-amber-900"
              >
                <span>+</span>
                {s.name}
                {label && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">· {label}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onSnooze(s)}
                aria-label={`Posponer sugerencias de "${s.name}" por 30 días`}
                className="flex min-h-9 w-9 shrink-0 select-none touch-manipulation items-center justify-center border-l border-amber-200 text-amber-500 active:bg-amber-100 dark:border-amber-900 dark:text-amber-500 dark:active:bg-amber-900"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </button>
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex min-h-9 select-none touch-manipulation items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:active:bg-zinc-800"
          >
            +{hiddenCount} más
          </button>
        )}
      </div>
    </div>
  );
}
