"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input } from "@/components/ui";
import {
  REVIEW_BATCH,
  REVIEW_COLUMNS,
  toReviewItems,
  type ReviewItem,
} from "@/lib/stock-review";

// Fase 38: repaso rápido de stock. El stock figura inflado porque se compra
// mucho y casi no se carga el consumo; en vez de resetearlo solo (fabricaría
// una cantidad que nadie vio), la vista product_stock_review marca qué
// productos pasaron su ciclo sin una compra ni un conteo que los confirme, y
// acá la persona los confirma con un toque. Cada respuesta se guarda con
// reason='count' (no cuenta como consumo en las estadísticas).
//
// Fase 39 (auditoría): el conteo es ABSOLUTO y lo resuelve la base
// (set_stock_count) contra el stock real de ese instante. Antes el delta se
// calculaba acá con la cantidad que tenía la pantalla al cargar, y si en el
// medio alguien bajaba el stock desde Stock, "No queda" lo dejaba negativo.

const FRACTIONAL_UNIT = /^(kg|l|lt|lts|litros?|g|gr|ml|cc)$/i;

// "Poco" = la mitad de lo que figuraba (piso 1 en unidades enteras). Solo se
// ofrece cuando hay al menos 2 para que la mitad sea distinta del número
// actual; para quedar en otro valor está "Contar".
function pocoTarget(item: ReviewItem): number | null {
  const fractional = FRACTIONAL_UNIT.test(item.unit_label.trim());
  const q = item.quantity_on_hand;
  if (fractional) {
    if (q <= 0.5) return null;
    const half = Math.round((q / 2) * 10) / 10;
    return half < q ? half : null;
  }
  if (q < 2) return null;
  const half = Math.max(1, Math.floor(q / 2));
  return half < q ? half : null;
}

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

type CountResult = { previous_quantity: number; new_quantity: number; delta: number };

function parseCountResult(data: unknown): CountResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const previous = Number(d.previous_quantity);
  const next = Number(d.new_quantity);
  const delta = Number(d.delta);
  if (![previous, next, delta].every(Number.isFinite)) return null;
  return { previous_quantity: previous, new_quantity: next, delta };
}

type UndoEntry = { item: ReviewItem; delta: number; label: string };

export function RepasoTab({
  householdId,
  initialItems,
  initialTotal,
  onApplied,
  onTotalChange,
}: {
  householdId: string;
  initialItems: ReviewItem[];
  initialTotal: number;
  onApplied: (productId: string, newQuantity: number) => void;
  onTotalChange: (total: number) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [busy, setBusy] = useState<string | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Pila (no solo la última acción): confirmar con "Queda" otro producto no
  // debe borrar la posibilidad de deshacer un "No queda" anterior.
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  // El contador del padre se sincroniza desde acá. Se actualiza con
  // funciones (no con el valor capturado) para que dos toques seguidos
  // sobre productos distintos no pisen la cuenta del otro.
  useEffect(() => {
    onTotalChange(total);
  }, [total, onTotalChange]);

  async function apply(item: ReviewItem, target: number | null, label: string) {
    if (target !== null && (!Number.isFinite(target) || target < 0)) return;

    setError(null);
    setBusy(item.product_id);
    setCountingId(null);

    const { data, error: rpcError } = await supabase.rpc("set_stock_count", {
      p_household_id: householdId,
      p_product_id: item.product_id,
      // undefined = "Queda": confirmar lo que haya realmente, sin cambiarlo.
      ...(target !== null ? { p_quantity: target } : {}),
    });
    setBusy(null);

    const result = parseCountResult(data);
    if (rpcError || !result) {
      setError(`No se pudo guardar "${item.name}". Probá de nuevo.`);
      return;
    }

    setItems((prev) => prev.filter((i) => i.product_id !== item.product_id));
    setTotal((t) => Math.max(0, t - 1));
    onApplied(item.product_id, result.new_quantity);
    // Solo se puede deshacer lo que cambió una cantidad; "Queda" (delta 0)
    // apenas reinicia el reloj.
    if (result.delta !== 0) {
      setUndoStack((prev) => [...prev, { item, delta: result.delta, label }].slice(-10));
    }
  }

  async function undo() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setError(null);
    const { error: rpcError } = await supabase.rpc("adjust_stock", {
      p_household_id: householdId,
      p_product_id: entry.item.product_id,
      p_delta: -entry.delta,
      p_reason: "count",
    });
    if (rpcError) {
      setError(`No se pudo deshacer "${entry.item.name}".`);
      return;
    }
    setUndoStack((prev) => prev.slice(0, -1));
    setItems((prev) => [entry.item, ...prev.filter((i) => i.product_id !== entry.item.product_id)]);
    setTotal((t) => t + 1);
    onApplied(entry.item.product_id, entry.item.quantity_on_hand);
  }

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    const { data, count, error: qError } = await supabase
      .from("product_stock_review")
      .select(REVIEW_COLUMNS, { count: "exact" })
      .eq("household_id", householdId)
      .eq("needs_review", true)
      .order("overdue_ratio", { ascending: false })
      .limit(REVIEW_BATCH);
    setLoadingMore(false);
    if (qError) {
      setError("No se pudo cargar la lista. Probá de nuevo.");
      return;
    }
    setItems(toReviewItems(data));
    setTotal(count ?? 0);
  }

  const lastUndo = undoStack[undoStack.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
        {total > 0
          ? `${total} producto${total === 1 ? "" : "s"} con el stock sin confirmar hace más de un ciclo. Decime qué hay realmente:`
          : "Todo el stock está confirmado por ahora."}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {lastUndo && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <span className="min-w-0 truncate">{lastUndo.label}</span>
          <Button size="sm" variant="ghost" onClick={undo}>
            Deshacer
          </Button>
        </div>
      )}

      {items.map((item) => {
        const poco = pocoTarget(item);
        const disabled = busy === item.product_id;
        const days = item.days_since_confirmed;
        const draftNumber = Number(draft);
        const draftInvalid = draft.trim() === "" || Number.isNaN(draftNumber) || draftNumber < 0;
        return (
          <Card key={item.product_id} className="flex flex-col gap-3 p-4">
            <div>
              <div className="font-medium text-zinc-900 dark:text-zinc-50">{item.name}</div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Figura: {fmtQty(item.quantity_on_hand)} {item.unit_label}
                {days != null && (
                  <>
                    {" "}
                    · sin confirmar hace {days} día{days === 1 ? "" : "s"}
                    {item.effective_cycle_days != null && ` (ciclo ${item.effective_cycle_days})`}
                  </>
                )}
              </div>
            </div>

            {countingId === item.product_id ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draftInvalid || disabled) return;
                  apply(item, draftNumber, `${item.name}: contado ${fmtQty(draftNumber)}`);
                }}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={`Cantidad real de ${item.name}`}
                />
                <Button type="submit" disabled={disabled || draftInvalid}>
                  Guardar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCountingId(null)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              // Botones de 44px de alto (size md): son la acción principal de
              // esta pantalla y se tocan con el carrito en la otra mano.
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={disabled}
                  onClick={() => apply(item, null, `${item.name}: confirmado`)}
                >
                  Queda
                </Button>
                <Button
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => apply(item, 0, `${item.name}: no queda`)}
                >
                  No queda
                </Button>
                {poco !== null && (
                  <Button
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => apply(item, poco, `${item.name}: queda ${fmtQty(poco)}`)}
                  >
                    Poco (→ {fmtQty(poco)})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    setCountingId(item.product_id);
                    setDraft(fmtQty(item.quantity_on_hand));
                  }}
                >
                  Contar
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {items.length === 0 && total > 0 && (
        <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Cargando…" : `Revisar los ${total} que faltan`}
        </Button>
      )}
    </div>
  );
}
