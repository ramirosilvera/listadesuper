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
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border-b border-zinc-100 bg-white px-3 py-2.5 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
                >
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
                  <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-50">
                    {p.name}
                  </span>
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
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
