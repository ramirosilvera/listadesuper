"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui";

type Product = {
  id: string;
  name: string;
  unit_label: string;
  category_id: string | null;
  quantity_on_hand: number;
  low_stock_threshold: number | null;
  restock_cycle_days: number | null;
};

type Category = { id: string; name: string; sort_order: number };

export function StockClient({
  householdId,
  products: initialProducts,
  categories,
}: {
  householdId: string;
  products: Product[];
  categories: Category[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [editingThresholdId, setEditingThresholdId] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [cycleDraft, setCycleDraft] = useState("");
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.trim().toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; order: number; items: Product[] }>();
    for (const p of filtered) {
      const cat = p.category_id ? categoryById.get(p.category_id) : null;
      const key = cat?.id ?? "_sin_categoria";
      if (!groups.has(key)) {
        groups.set(key, { label: cat?.name ?? "Otros", order: cat?.sort_order ?? 999, items: [] });
      }
      groups.get(key)!.items.push(p);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  }, [filtered, categoryById]);

  async function adjust(product: Product, delta: number) {
    const next = Math.max(0, product.quantity_on_hand + delta);
    const realDelta = next - product.quantity_on_hand;
    if (realDelta === 0) return;

    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, quantity_on_hand: next } : p)),
    );

    await supabase.rpc("adjust_stock", {
      p_household_id: householdId,
      p_product_id: product.id,
      p_delta: realDelta,
      p_reason: "manual_adjust",
    });
  }

  function startEditingThreshold(product: Product) {
    setEditingThresholdId(product.id);
    setThresholdDraft(
      product.low_stock_threshold !== null ? String(product.low_stock_threshold) : "",
    );
  }

  async function saveThreshold(product: Product) {
    const parsed = thresholdDraft.trim() === "" ? null : Number(thresholdDraft);
    const value = parsed !== null && !isNaN(parsed) && parsed >= 0 ? parsed : null;

    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, low_stock_threshold: value } : p)),
    );
    setEditingThresholdId(null);

    await supabase
      .from("products")
      .update({ low_stock_threshold: value })
      .eq("id", product.id);
  }

  function startEditingCycle(product: Product) {
    setEditingCycleId(product.id);
    setCycleDraft(
      product.restock_cycle_days !== null ? String(product.restock_cycle_days) : "",
    );
  }

  // Ciclo de compra: control adicional a la cantidad en stock. Sirve para
  // productos que se compran por hábito en un intervalo mas o menos fijo
  // (ej. aceite de oliva 1 vez por mes) independientemente de cuantas
  // unidades queden — y como red por si se olvidan de actualizar el stock
  // a mano. Ver vista product_replenishment (columna restock_reason
  // 'ciclo_de_compra').
  async function saveCycle(product: Product) {
    const parsed = cycleDraft.trim() === "" ? null : Number(cycleDraft);
    const value = parsed !== null && !isNaN(parsed) && parsed > 0 ? parsed : null;

    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, restock_cycle_days: value } : p)),
    );
    setEditingCycleId(null);

    await supabase
      .from("products")
      .update({ restock_cycle_days: value })
      .eq("id", product.id);
  }

  // Soft delete: products.archived (no un DELETE real) para no perder el
  // historial de compras/gastos de ese producto en Reportes. Deja de
  // aparecer en Stock, en las sugerencias de reposición y en Vencimientos.
  async function archiveProduct(product: Product) {
    setArchiving(product.id);
    const { error } = await supabase
      .from("products")
      .update({ archived: true })
      .eq("id", product.id);
    setArchiving(null);
    setConfirmArchiveId(null);
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Input
        placeholder="Buscar producto…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {grouped.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          Todavía no hay productos. Se van a ir sumando solos a medida que
          registrés compras.
        </p>
      )}

      {grouped.map((group) => (
        <div key={group.label}>
          <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            {group.label}
          </h2>
          <ul className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {group.items.map((p) => {
              const level =
                p.quantity_on_hand <= 0
                  ? "empty"
                  : p.quantity_on_hand <= 1
                    ? "low"
                    : "ok";
              const isEditingThreshold = editingThresholdId === p.id;
              const isEditingCycle = editingCycleId === p.id;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-1.5 border-b border-zinc-100 bg-white px-3 py-2.5 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
                >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      level === "empty"
                        ? "bg-red-500"
                        : level === "low"
                          ? "bg-amber-500"
                          : "bg-[#16A34A]"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-900 dark:text-zinc-50">{p.name}</p>
                    <div className="flex flex-wrap gap-x-2">
                      {!isEditingThreshold && (
                        <button
                          type="button"
                          onClick={() => startEditingThreshold(p)}
                          className="text-xs text-zinc-400 underline decoration-dotted active:text-zinc-600 dark:active:text-zinc-300"
                        >
                          {p.low_stock_threshold !== null
                            ? `Avisar con ${p.low_stock_threshold} o menos`
                            : "Avisar con poco stock"}
                        </button>
                      )}
                      {!isEditingCycle && (
                        <button
                          type="button"
                          onClick={() => startEditingCycle(p)}
                          className="text-xs text-zinc-400 underline decoration-dotted active:text-zinc-600 dark:active:text-zinc-300"
                        >
                          {p.restock_cycle_days !== null
                            ? `Se compra cada ${p.restock_cycle_days} días`
                            : "Sin ciclo de compra"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center text-sm text-zinc-600 dark:text-zinc-400">
                    <button
                      type="button"
                      onClick={() => adjust(p, -1)}
                      className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full active:bg-zinc-200 dark:active:bg-zinc-700"
                      aria-label="Restar"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                        −
                      </span>
                    </button>
                    <span className="w-10 text-center tabular-nums">
                      {p.quantity_on_hand}
                      <span className="ml-0.5 text-xs text-zinc-400">
                        {p.unit_label}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => adjust(p, 1)}
                      className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full active:bg-zinc-200 dark:active:bg-zinc-700"
                      aria-label="Sumar"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                        +
                      </span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmArchiveId(p.id)}
                    aria-label={`Quitar ${p.name} del catálogo`}
                    className="flex h-9 w-9 shrink-0 select-none items-center justify-center text-zinc-400 active:text-red-500"
                  >
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>

                {confirmArchiveId === p.id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                    <span className="flex-1">
                      ¿Quitar &quot;{p.name}&quot; del catálogo? No va a figurar más en Stock ni en sugeridos para reponer.
                    </span>
                    <button
                      type="button"
                      disabled={archiving === p.id}
                      onClick={() => archiveProduct(p)}
                      className="min-h-8 select-none touch-manipulation rounded-full bg-red-600 px-3 text-xs font-medium text-white active:bg-red-700 disabled:opacity-50"
                    >
                      {archiving === p.id ? "Quitando…" : "Sí, quitar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmArchiveId(null)}
                      className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-red-700 dark:text-red-300"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {isEditingThreshold && (
                  <div className="flex items-center gap-2 pl-[1.375rem]">
                    <label className="text-xs text-zinc-500">
                      Avisar cuando queden
                    </label>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      autoFocus
                      value={thresholdDraft}
                      onChange={(e) => setThresholdDraft(e.target.value)}
                      placeholder="sin aviso"
                      className="h-9 w-20 rounded-lg border border-zinc-300 px-2 text-center text-base dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => saveThreshold(p)}
                      className="min-h-9 select-none touch-manipulation rounded-full bg-[#16A34A] px-3 text-xs font-medium text-white active:bg-[#15803D]"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingThresholdId(null)}
                      className="min-h-9 select-none touch-manipulation rounded-full px-2 text-xs text-zinc-500"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {isEditingCycle && (
                  <div className="flex items-center gap-2 pl-[1.375rem]">
                    <label className="text-xs text-zinc-500">
                      Se compra cada
                    </label>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      autoFocus
                      value={cycleDraft}
                      onChange={(e) => setCycleDraft(e.target.value)}
                      placeholder="sin ciclo"
                      className="h-9 w-20 rounded-lg border border-zinc-300 px-2 text-center text-base dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <span className="text-xs text-zinc-500">días</span>
                    <button
                      type="button"
                      onClick={() => saveCycle(p)}
                      className="min-h-9 select-none touch-manipulation rounded-full bg-[#16A34A] px-3 text-xs font-medium text-white active:bg-[#15803D]"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCycleId(null)}
                      className="min-h-9 select-none touch-manipulation rounded-full px-2 text-xs text-zinc-500"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
