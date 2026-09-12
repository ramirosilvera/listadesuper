"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RestockChips } from "@/components/restock-chips";
import { Button, Input } from "@/components/ui";

type Product = {
  id: string;
  name: string;
  unit_label: string;
  default_shelf_life_days: number | null;
};
type Store = { id: string; name: string };
type Category = { id: string; name: string; sort_order: number };

type CheckedItem = {
  id: string;
  quantity: number;
  product_id: string;
  products: Product | null;
};

type Suggestion = {
  product_id: string | null;
  name: string | null;
  unit_label: string | null;
  restock_reason: string | null;
};

type Row = {
  key: string;
  product_id: string;
  name: string;
  unit_label: string;
  quantity: number;
  unit_price: string;
  expiration_date: string;
};

// Fecha de vencimiento sugerida a partir de la vida util estimada del
// producto (misma logica que usa record_purchase en el server cuando no
// se manda expiration_date explicito) — precargarla ahorra tener que
// tipear la fecha a mano en cada compra; el campo sigue siendo editable.
function suggestExpiration(shelfLifeDays: number | null): string {
  if (!shelfLifeDays) return "";
  const d = new Date();
  d.setDate(d.getDate() + shelfLifeDays);
  return d.toISOString().slice(0, 10);
}

export function ComprarClient({
  householdId,
  initialItems,
  allProducts,
  stores,
  categories,
  suggestions: initialSuggestions,
}: {
  householdId: string;
  initialItems: CheckedItem[];
  allProducts: Product[];
  stores: Store[];
  categories: Category[];
  suggestions: Suggestion[];
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
        expiration_date: suggestExpiration(it.products!.default_shelf_life_days),
      })),
  );
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [query, setQuery] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [newStoreName, setNewStoreName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [newProductCategoryId, setNewProductCategoryId] = useState("");

  const total = rows.reduce((sum, r) => {
    const price = parseFloat(r.unit_price.replace(",", "."));
    return sum + (isNaN(price) ? 0 : price * r.quantity);
  }, 0);

  const productSuggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const already = new Set(rows.map((r) => r.product_id));
    return allProducts
      .filter((p) => !already.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, allProducts, rows]);

  // Mismo criterio que en Lista: pedir categoría solo tiene sentido si el
  // nombre no coincide con ningún producto existente -- si coincide,
  // "+ Agregar" reusa el producto ya cargado (ver addNewProduct).
  const looksLikeNewProduct = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return !allProducts.some((p) => p.name.toLowerCase() === q);
  }, [query, allProducts]);

  const restockChips = useMemo(() => {
    const already = new Set(rows.map((r) => r.product_id));
    return suggestions.filter((s) => s.product_id && !already.has(s.product_id));
  }, [suggestions, rows]);

  function addRow(product: Product) {
    setQuery("");
    setNewProductCategoryId("");
    setRows((prev) => {
      // El desplegable de sugerencias ya excluye productos que están en
      // `rows`, pero el submit de "+ Agregar X" (addNewProduct) no pasa
      // por esa lista — sin este chequeo, escribir el nombre de un
      // producto ya cargado y confirmar agregaba una segunda fila igual.
      if (prev.some((r) => r.product_id === product.id)) return prev;
      return [
        ...prev,
        {
          key: product.id,
          product_id: product.id,
          name: product.name,
          unit_label: product.unit_label,
          quantity: 1,
          unit_price: "",
          expiration_date: suggestExpiration(product.default_shelf_life_days),
        },
      ];
    });
    setSuggestions((prev) => prev.filter((s) => s.product_id !== product.id));
  }

  async function addNewProduct(e: FormEvent) {
    e.preventDefault();
    const name = query.trim();
    if (!name) return;

    // Mismo chequeo que ya hace Lista antes de crear un producto nuevo:
    // sin esto, tipear el nombre completo y confirmar (en vez de tocar
    // la sugerencia del desplegable) creaba un producto duplicado que
    // fragmenta stock e historial desde ese momento.
    const existing = allProducts.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      addRow(existing);
      return;
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        household_id: householdId,
        name,
        category_id: newProductCategoryId || null,
      })
      .select("id, name, unit_label, default_shelf_life_days")
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

  // confirmDuplicate=true solo se manda cuando la persona ya vio el aviso
  // de "compra parecida hace poco" (ver record_purchase, Fase 17) y tocó
  // "Confirmar de todos modos" — la primera vez siempre va en false.
  async function handleSubmit(confirmDuplicate = false) {
    setError(null);
    if (!confirmDuplicate) setDuplicateWarning(null);
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
      // Si hace falta reintentar (ver aviso de posible duplicado más
      // abajo), que la próxima vuelta reuse este súper en vez de crear
      // otro con el mismo nombre — sin esto, confirmar una compra
      // duplicada de un súper recién tipeado duplicaba también el súper.
      setStoreId(store.id);
    }

    const items = rows.map((r) => {
      const price = parseFloat(r.unit_price.replace(",", "."));
      return {
        product_id: r.product_id,
        quantity: r.quantity,
        unit_price: isNaN(price) ? null : price,
        expiration_date: r.expiration_date || null,
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
      p_confirm_duplicate: confirmDuplicate,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (rpcError) {
      setSubmitting(false);
      // record_purchase (Fase 17) tira este mensaje puntual cuando hay una
      // compra reciente con productos en común en el mismo hogar — no es
      // un error real, es un "¿estás seguro?" antes de guardar. El texto
      // explicativo viaja en el detail de la excepción de Postgres.
      if (rpcError.message === "possible_duplicate") {
        setDuplicateWarning(
          rpcError.details ||
            "Parece que ya se cargó una compra parecida hace poco.",
        );
        return;
      }
      setError(rpcError.message);
      return;
    }

    // Sin setSubmitting(false) acá a propósito: el botón se mantiene en
    // "Registrando…" hasta que la navegación reemplaza esta pantalla, para
    // no parpadear a su estado normal mientras Lista todavía está cargando.
    router.push("/lista");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <form onSubmit={addNewProduct} className="relative">
        <Input
          placeholder="Agregar producto a la compra…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            {productSuggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addRow(p)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {p.name}
              </button>
            ))}
            {looksLikeNewProduct && categories.length > 0 && (
              <div className="flex items-center gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <label htmlFor="new-product-category" className="shrink-0 text-xs text-zinc-500">
                  Categoría
                </label>
                <select
                  id="new-product-category"
                  value={newProductCategoryId}
                  onChange={(e) => setNewProductCategoryId(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <option value="">Sin categoría (Otros)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              className="block w-full border-t border-zinc-200 px-3 py-2 text-left text-sm font-medium text-[#16A34A] hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
            >
              + Agregar &quot;{query.trim()}&quot;
            </button>
          </div>
        )}
      </form>

      <RestockChips
        title="Sugeridos para reponer"
        suggestions={restockChips}
        onAdd={(s) => {
          const product = allProducts.find((p) => p.id === s.product_id);
          addRow(
            product ?? {
              id: s.product_id!,
              name: s.name ?? "Producto",
              unit_label: s.unit_label ?? "unidad",
              default_shelf_life_days: null,
            },
          );
        }}
      />

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
              className="flex flex-col gap-1.5 border-b border-zinc-100 bg-white px-3 py-2.5 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-center gap-2">
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
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-500">
                {row.expiration_date ? "Vence el (sugerido, editable)" : "Vence el (opcional)"}
                <input
                  type="date"
                  value={row.expiration_date}
                  onChange={(e) => updateRow(row.key, { expiration_date: e.target.value })}
                  className="h-9 rounded-lg border border-zinc-300 px-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  aria-label={`Fecha de vencimiento de ${row.name}`}
                />
              </label>
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

      {duplicateWarning && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <p>{duplicateWarning} ¿Confirmás que no es un error?</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(true)}
              className="min-h-8 select-none touch-manipulation rounded-full bg-amber-600 px-3 text-xs font-medium text-white active:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? "Registrando…" : "Confirmar de todos modos"}
            </button>
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-amber-700 dark:text-amber-300"
            >
              Revisar
            </button>
          </div>
        </div>
      )}

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
          onClick={() => handleSubmit(false)}
          disabled={submitting || rows.length === 0 || !!duplicateWarning}
          className="w-full shadow-lg"
        >
          {submitting ? "Registrando…" : "Confirmar compra"}
        </Button>
      </div>
    </div>
  );
}
