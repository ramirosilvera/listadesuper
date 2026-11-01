"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input } from "@/components/ui";
import { REVIEW_BATCH, REVIEW_COLUMNS, toReviewItems, type ReviewItem } from "@/lib/stock-review";

// Fase 38: repaso rápido de stock. El stock figura inflado porque se compra
// mucho y casi no se carga el consumo; en vez de resetearlo solo (fabricaría
// una cantidad que nadie vio), la vista product_stock_review marca qué
// productos pasaron su ciclo sin una compra ni un conteo que los confirme, y
// acá la persona los confirma con un toque. Cada respuesta se guarda con
// reason='count' (no cuenta como consumo en las estadísticas).

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

type LastAction = { item: ReviewItem; delta: number; label: string };

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
  const [last, setLast] = useState<LastAction | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  function updateTotal(next: number) {
    setTotal(next);
    onTotalChange(next);
  }

  async function apply(item: ReviewItem, newQuantity: number, label: string) {
    if (!Number.isFinite(newQuantity) || newQuantity < 0) return;
    const delta = Math.round((newQuantity - item.quantity_on_hand) * 1000) / 1000;

    setError(null);
    setBusy(item.product_id);
    setCountingId(null);

    const { error: rpcError } = await supabase.rpc("adjust_stock", {
      p_household_id: householdId,
      p_product_id: item.product_id,
      p_delta: delta,
      p_reason: "count",
    });
    setBusy(null);

    if (rpcError) {
      setError(`No se pudo guardar "${item.name}". Probá de nuevo.`);
      return;
    }

    setItems((prev) => prev.filter((i) => i.product_id !== item.product_id));
    updateTotal(Math.max(0, total - 1));
    onApplied(item.product_id, newQuantity);
    // "Queda" (delta 0) solo reinicia el reloj: no hay cantidad que deshacer.
    setLast(delta !== 0 ? { item, delta, label } : null);
  }

  async function undo() {
    if (!last) return;
    const { item, delta } = last;
    setError(null);
    const { error: rpcError } = await supabase.rpc("adjust_stock", {
      p_household_id: householdId,
      p_product_id: item.product_id,
      p_delta: -delta,
      p_reason: "count",
    });
    if (rpcError) {
      setError(`No se pudo deshacer "${item.name}".`);
      return;
    }
    setItems((prev) => [item, ...prev]);
    updateTotal(total + 1);
    onApplied(item.product_id, item.quantity_on_hand);
    setLast(null);
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
    updateTotal(count ?? 0);
    setLast(null);
  }

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

      {last && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <span className="min-w-0 truncate">{last.label}</span>
          <Button size="sm" variant="ghost" onClick={undo}>
            Deshacer
          </Button>
        </div>
      )}

      {items.map((item) => {
        const poco = pocoTarget(item);
        const disabled = busy === item.product_id;
        const days = item.days_since_confirmed;
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
              <div className="flex items-center gap-2">
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
                <Button
                  disabled={disabled || draft.trim() === "" || Number.isNaN(Number(draft)) || Number(draft) < 0}
                  onClick={() => apply(item, Number(draft), `${item.name}: contado ${fmtQty(Number(draft))}`)}
                >
                  Guardar
                </Button>
                <Button variant="ghost" onClick={() => setCountingId(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() => apply(item, item.quantity_on_hand, `${item.name}: confirmado`)}
                >
                  Queda
                </Button>
                {poco !== null && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => apply(item, poco, `${item.name}: queda ${fmtQty(poco)}`)}
                  >
                    Poco (→ {fmtQty(poco)})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => apply(item, 0, `${item.name}: no queda`)}
                >
                  No queda
                </Button>
                <Button
                  size="sm"
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
