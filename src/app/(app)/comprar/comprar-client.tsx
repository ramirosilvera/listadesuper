"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";

type Product = { id: string; name: string; unit_label: string };
type Store = { id: string; name: string };

type CheckedItem = {
  id: string;
  quantity: number;
  product_id: string;
  products: Product | null;
};

type Row = {
  key: string;
  product_id: string;
  name: string;
  unit_label: string;
  quantity: number;
  unit_price: string;
};

export function ComprarClient({
  householdId,
  initialItems,
  allProducts,
  stores,
}: {
  householdId: string;
  initialItems: CheckedItem[];
  allProducts: Product[];
  stores: Store[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>(() =>
    initialItems
      .filter((it) => it.products)
      .map((it) => ({
        key: it.id,
        product_id: it.product_id,
        name: it.products!.name,
        unit_label: it.products!.unit_label,
        quantity: it.quantity,
        unit_price: "",
      })),
  );
  const [query, setQuery] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [newStoreName, setNewStoreName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((sum, r) => {
    const price = parseFloat(r.unit_price.replace(",", "."));
    return sum + (isNaN(price) ? 0 : price * r.quantity);
  }, 0);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const already = new Set(rows.map((r) => r.product_id));
    return allProducts
      .filter((p) => !already.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, allProducts, rows]);

  function addRow(product: Product) {
    setQuery("");
    setRows((prev) => [
      ...prev,
      {
        key: product.id,
        product_id: product.id,
        name: product.name,
        unit_label: product.unit_label,
        quantity: 1,
        unit_price: "",
      },
    ]);
  }

  async function addNewProduct(e: FormEvent) {
    e.preventDefault();
    const name = query.trim();
    if (!name) return;
    const { data: product, error } = await supabase
      .from("products")
      .insert({ household_id: householdId, name })
      .select("id, name, unit_label")
      .single();
    if (error || !product) return;
    addRow(product);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleSubmit() {
    setError(null);
    if (rows.length === 0) {
      setError("Agregá al menos un producto.");
      return;
    }
    setSubmitting(true);

    let finalStoreId: string | null = storeId || null;
    if (!finalStoreId && newStoreName.trim()) {
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .insert({ household_id: householdId, name: newStoreName.trim() })
        .select("id")
        .single();
      if (storeError) {
        setSubmitting(false);
        setError(storeError.message);
        return;
      }
      finalStoreId = store.id;
    }

    const items = rows.map((r) => {
      const price = parseFloat(r.unit_price.replace(",", "."));
      return {
        product_id: r.product_id,
        quantity: r.quantity,
        unit_price: isNaN(price) ? null : price,
      };
    });

    // El generador de tipos de Supabase no marca los params nullable de
    // las RPC como `| null` (ver Database["public"]["Functions"]), aunque
    // la función SQL sí los acepta (p_store_id/p_receipt_image_path son
    // uuid/text sin NOT NULL). El cast es intencional, no un error real.
    const { error: rpcError } = await supabase.rpc("record_purchase", {
      p_household_id: householdId,
      p_store_id: finalStoreId,
      p_purchased_at: new Date().toISOString(),
      p_source: "manual",
      p_receipt_image_path: null,
      p_items: items,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.push("/lista");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Supermercado (opcional)
        </label>
        <div className="mt-1 flex gap-2">
          <select
            className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              setNewStoreName("");
            }}
          >
            <option value="">Sin especificar</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new__" disabled>
              — o escribí uno nuevo abajo —
            </option>
          </select>
        </div>
        {!storeId && (
          <Input
            className="mt-2"
            placeholder="Nombre de un supermercado nuevo (opcional)"
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
          />
        )}
      </div>

      <form onSubmit={addNewProduct} className="relative">
        <Input
          placeholder="Agregar producto a la compra…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addRow(p)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {p.name}
              </button>
            ))}
            <button
              type="submit"
              className="block w-full border-t border-zinc-200 px-3 py-2 text-left text-sm font-medium text-[#16A34A] hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
            >
              + Agregar &quot;{query.trim()}&quot;
            </button>
          </div>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          No tenés ítems tildados en la lista. Agregalos arriba a medida que
          los vas poniendo en el changuito.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-white px-3 py-2.5 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
            >
              <span className="min-w-[7rem] flex-1 text-sm text-zinc-900 dark:text-zinc-50">
                {row.name}
              </span>
              <input
                type="number"
                min={1}
                step="1"
                inputMode="numeric"
                value={row.quantity}
                onChange={(e) =>
                  updateRow(row.key, {
                    quantity: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                // text-base (16px), no text-sm: un input mas chico hace
                // que iOS Safari haga auto-zoom al tocarlo.
                className="h-11 w-16 rounded-lg border border-zinc-300 px-2 text-center text-base dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="Cantidad"
              />
              <span className="text-xs text-zinc-400">{row.unit_label}</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="$ precio unit."
                value={row.unit_price}
                onChange={(e) => updateRow(row.key, { unit_price: e.target.value })}
                className="h-11 w-28 rounded-lg border border-zinc-300 px-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="Precio unitario"
              />
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                aria-label="Quitar"
                className="flex h-11 w-11 shrink-0 select-none items-center justify-center text-zinc-400 active:text-red-500"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <p className="text-right text-sm text-zinc-600 dark:text-zinc-400">
          Total estimado: <span className="font-semibold text-zinc-900 dark:text-zinc-50">${total.toFixed(2)}</span>
        </p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/*
        bottom: no se usa bottom-16 de Tailwind (fijo) porque la altura
        real del nav de abajo varía con env(safe-area-inset-bottom) según
        el dispositivo (los iPhone con home indicator suman ~34px) — con
        un valor fijo esta barra queda tapada por el nav en esos equipos.
      */}
      <div
        className="fixed inset-x-0 z-10 mx-auto max-w-2xl px-4"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          onClick={handleSubmit}
          disabled={submitting || rows.length === 0}
          className="w-full shadow-lg"
        >
          {submitting ? "Registrando…" : "Confirmar compra"}
        </Button>
      </div>
    </div>
  );
}
