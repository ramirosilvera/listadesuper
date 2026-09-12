"use client";

import { useState } from "react";
import { restockReasonLabel } from "@/lib/restock";

export type RestockSuggestion = {
  product_id: string | null;
  name: string | null;
  unit_label: string | null;
  restock_reason: string | null;
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
}: {
  title: string;
  suggestions: RestockSuggestion[];
  onAdd: (suggestion: RestockSuggestion) => void;
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
        {visible.map((s) =>
          s.product_id ? (
            <button
              key={s.product_id}
              type="button"
              onClick={() => onAdd(s)}
              className="flex min-h-9 select-none touch-manipulation items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-sm text-amber-800 active:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:active:bg-amber-900"
            >
              <span>+</span>
              {s.name}
              {restockReasonLabel(s.restock_reason) && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  · {restockReasonLabel(s.restock_reason)}
                </span>
              )}
            </button>
          ) : null,
        )}
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
