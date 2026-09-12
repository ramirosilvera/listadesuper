"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";

export type ProductSuggestion = {
  product_id: string;
  name: string;
  suggestion_type: "ciclo_de_compra" | "umbral_manual" | "archivar";
  current_value: number | null;
  suggested_value: number | null;
  evidence_count: number | null;
  reason: string;
};

const GROUP_META: Record<
  ProductSuggestion["suggestion_type"],
  { title: string; applyLabel: (s: ProductSuggestion) => string }
> = {
  ciclo_de_compra: {
    title: "Ciclos de compra desactualizados",
    applyLabel: (s) =>
      s.current_value == null
        ? `Configurar cada ${s.suggested_value} días`
        : `Cambiar a cada ${s.suggested_value} días`,
  },
  umbral_manual: {
    title: "Umbrales de stock mal calibrados",
    applyLabel: (s) =>
      s.current_value == null
        ? `Avisar con ${s.suggested_value}`
        : `Cambiar a ${s.suggested_value}`,
  },
  archivar: {
    title: "Productos que parecen inactivos",
    applyLabel: () => "Archivar",
  },
};

// Estadística simple y explicable sobre stock_movements/products (ver
// vista product_suggestions), no un modelo entrenado: con el volumen de
// datos de un solo hogar un modelo real sobreajustaría, y acá lo que
// importa es que cada sugerencia se pueda justificar en una frase.
export function SuggestionsPanel({
  suggestions: initial,
}: {
  suggestions: ProductSuggestion[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [suggestions, setSuggestions] = useState(initial);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const order: ProductSuggestion["suggestion_type"][] = [
      "ciclo_de_compra",
      "umbral_manual",
      "archivar",
    ];
    return order
      .map((type) => ({ type, items: suggestions.filter((s) => s.suggestion_type === type) }))
      .filter((g) => g.items.length > 0);
  }, [suggestions]);

  function key(s: ProductSuggestion) {
    return `${s.product_id}:${s.suggestion_type}`;
  }

  function remove(s: ProductSuggestion) {
    setSuggestions((prev) => prev.filter((x) => key(x) !== key(s)));
    // El badge de cantidad en la pestaña se calcula en el server
    // (reportes/page.tsx) y llega como prop — sin esto quedaba
    // desactualizado hasta la próxima navegación completa.
    router.refresh();
  }

  async function apply(s: ProductSuggestion) {
    setErrorKey(null);
    setBusyKey(key(s));
    const { error } = await supabase.rpc("apply_product_suggestion", {
      p_product_id: s.product_id,
      p_suggestion_type: s.suggestion_type,
      p_value: s.suggested_value ?? undefined,
    });
    setBusyKey(null);
    setConfirmKey(null);
    if (error) {
      setErrorKey(key(s));
    } else {
      remove(s);
    }
  }

  async function dismiss(s: ProductSuggestion) {
    setErrorKey(null);
    setBusyKey(key(s));
    const { error } = await supabase.rpc("dismiss_product_suggestion", {
      p_product_id: s.product_id,
      p_suggestion_type: s.suggestion_type,
      p_value: s.suggested_value ?? undefined,
    });
    setBusyKey(null);
    if (error) {
      setErrorKey(key(s));
    } else {
      remove(s);
    }
  }

  if (suggestions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">
        Sin sugerencias por ahora. A medida que se acumulen más compras y
        consumos reales, van a aparecer acá ideas para ajustar ciclos,
        umbrales o archivar productos que dejaron de usarse.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {grouped.map((group) => (
        <div key={group.type} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            {GROUP_META[group.type].title}
          </h2>
          <ul className="flex flex-col gap-2">
            {group.items.map((s) => {
              const k = key(s);
              const busy = busyKey === k;
              const needsConfirm = s.suggestion_type === "archivar";
              const confirming = confirmKey === k;
              return (
                <li key={k}>
                  <Card className="flex flex-col gap-2 p-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {s.name}
                      </p>
                      <p className="text-xs text-zinc-500">{s.reason}</p>
                    </div>

                    {errorKey === k && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        No se pudo aplicar. Probá de nuevo.
                      </p>
                    )}

                    {confirming ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                        <span className="flex-1">
                          ¿Archivar &quot;{s.name}&quot;? Deja de aparecer en
                          Stock y en sugeridos para reponer (se puede
                          reactivar después desde Ajustes).
                        </span>
                        <Button variant="danger" size="sm" disabled={busy} onClick={() => apply(s)}>
                          {busy ? "Archivando…" : "Sí, archivar"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setConfirmKey(null)}
                          className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-red-700 dark:text-red-300"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={busy}
                          onClick={() => (needsConfirm ? setConfirmKey(k) : apply(s))}
                        >
                          {busy ? "Aplicando…" : GROUP_META[group.type].applyLabel(s)}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => dismiss(s)}>
                          Descartar
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
