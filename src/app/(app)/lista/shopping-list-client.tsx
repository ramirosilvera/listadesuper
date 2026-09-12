"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RestockChips } from "@/components/restock-chips";
import { Button, IconButton, Input } from "@/components/ui";

type Product = {
  id: string;
  name: string;
  unit_label: string;
  category_id: string | null;
};

type Category = { id: string; name: string; sort_order: number };

type ListItem = {
  id: string;
  quantity: number;
  checked: boolean;
  product_id: string;
  products: Product | null;
};

type Suggestion = {
  product_id: string | null;
  name: string | null;
  unit_label: string | null;
  restock_reason: string | null;
};

export function ShoppingListClient({
  householdId,
  listId,
  userId,
  initialItems,
  allProducts,
  categories,
  suggestions: initialSuggestions,
}: {
  householdId: string;
  listId: string;
  userId: string;
  initialItems: ListItem[];
  allProducts: Product[];
  categories: Category[];
  suggestions: Suggestion[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ListItem[]>(initialItems);
  const [products, setProducts] = useState<Product[]>(allProducts);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newProductCategoryId, setNewProductCategoryId] = useState("");
  // "reconnecting" (no "connecting" inicial) a propósito: no queremos
  // mostrar nada en el arranque normal de la página, solo cuando el
  // canal YA estaba conectado y se cae -- eso es lo que de verdad importa
  // avisar (mala señal en el súper, el caso de uso central de la app).
  const [realtimeStatus, setRealtimeStatus] = useState<"connected" | "reconnecting">("connected");

  useEffect(() => {
    let active = true;
    let everConnected = false;

    // Postgres Changes no reproduce los eventos perdidos durante un corte
    // al reconectar (a diferencia de "broadcast" con replay, que es otra
    // cosa) -- sin este refetch, dos personas del hogar con mala señal en
    // el súper podían terminar viendo listas desincronizadas en silencio
    // hasta refrescar a mano.
    async function refetchItems() {
      const { data } = await supabase
        .from("shopping_list_items")
        .select("id, quantity, checked, product_id, products(id, name, unit_label, category_id)")
        .eq("list_id", listId);
      if (active && data) setItems(data as ListItem[]);
    }

    const channel = supabase
      .channel(`shopping_list_items:${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_list_items",
          filter: `list_id=eq.${listId}`,
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setItems((prev) => prev.filter((it) => it.id !== oldId));
            return;
          }

          const row = payload.new as {
            id: string;
            quantity: number;
            checked: boolean;
            product_id: string;
          };

          if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((it) =>
                it.id === row.id
                  ? { ...it, quantity: row.quantity, checked: row.checked }
                  : it,
              ),
            );
          }

          if (payload.eventType === "INSERT") {
            let product = products.find((p) => p.id === row.product_id);
            if (!product) {
              const { data } = await supabase
                .from("products")
                .select("id, name, unit_label, category_id")
                .eq("id", row.product_id)
                .single();
              if (data) {
                product = data;
                setProducts((prev) => [...prev, data]);
              }
            }
            setItems((prev) => {
              if (prev.some((it) => it.id === row.id)) return prev;
              return [
                ...prev,
                {
                  id: row.id,
                  quantity: row.quantity,
                  checked: row.checked,
                  product_id: row.product_id,
                  products: product ?? null,
                },
              ];
            });
          }
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
          if (everConnected) refetchItems();
          everConnected = true;
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeStatus("reconnecting");
        }
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; order: number; items: ListItem[] }>();
    for (const item of items) {
      const catId = item.products?.category_id ?? "_sin_categoria";
      const cat = catId !== "_sin_categoria" ? categoryById.get(catId) : null;
      const key = cat?.id ?? "_sin_categoria";
      if (!groups.has(key)) {
        groups.set(key, {
          label: cat?.name ?? "Otros",
          order: cat?.sort_order ?? 999,
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  }, [items, categoryById]);

  const checkedCount = items.filter((it) => it.checked).length;

  const productSuggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const alreadyInList = new Set(items.map((it) => it.product_id));
    return products
      .filter((p) => !alreadyInList.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, products, items]);

  // Solo tiene sentido pedir categoría cuando lo que se va a crear es un
  // producto NUEVO -- si el nombre ya existe, "+ Agregar" en realidad
  // reusa el producto existente (ver handleAddSubmit) y ya tiene su
  // categoría de antes, elegir una acá no haría nada.
  const looksLikeNewProduct = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return !products.some((p) => p.name.toLowerCase() === q);
  }, [query, products]);

  async function toggleChecked(item: ListItem) {
    const next = !item.checked;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, checked: next } : it)),
    );
    await supabase
      .from("shopping_list_items")
      .update({
        checked: next,
        checked_at: next ? new Date().toISOString() : null,
        checked_by: next ? userId : null,
      })
      .eq("id", item.id);
  }

  async function changeQuantity(item: ListItem, delta: number) {
    // Optimista para que se sienta instantáneo, pero el guardado real es
    // un delta atómico en la base (increment_list_item_quantity), no un
    // valor absoluto calculado acá -- si dos personas del hogar tocan
    // +/- sobre el mismo ítem casi al mismo tiempo, un UPDATE con el
    // valor absoluto que cada una calculó localmente puede pisar el
    // incremento de la otra. El realtime ya existente corrige cualquier
    // diferencia entre lo optimista y lo que terminó quedando en la base.
    const next = Math.max(1, item.quantity + delta);
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, quantity: next } : it)),
    );
    await supabase.rpc("increment_list_item_quantity", {
      p_item_id: item.id,
      p_delta: delta,
    });
  }

  async function removeItem(item: ListItem) {
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    await supabase.from("shopping_list_items").delete().eq("id", item.id);
  }

  async function addExistingProduct(product: Product) {
    setQuery("");
    setNewProductCategoryId("");
    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert({
        list_id: listId,
        product_id: product.id,
        added_by: userId,
      })
      .select("id, quantity, checked, product_id, products(id, name, unit_label, category_id)")
      .single();
    if (!error && data) {
      setItems((prev) =>
        prev.some((it) => it.id === data.id) ? prev : [...prev, data as ListItem],
      );
      setSuggestions((prev) => prev.filter((s) => s.product_id !== product.id));
    }
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    const name = query.trim();
    if (!name) return;

    const existing = products.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      await addExistingProduct(existing);
      return;
    }

    setAdding(true);
    const { data: product, error } = await supabase
      .from("products")
      .insert({
        household_id: householdId,
        name,
        category_id: newProductCategoryId || null,
      })
      .select("id, name, unit_label, category_id")
      .single();
    setAdding(false);
    if (error || !product) return;

    setProducts((prev) => [...prev, product]);
    await addExistingProduct(product);
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {realtimeStatus === "reconnecting" && (
        <p
          className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          aria-live="polite"
        >
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-zinc-400" aria-hidden />
          Reconectando — lo que cambien otros en la lista puede tardar en verse.
        </p>
      )}

      <form onSubmit={handleAddSubmit} className="relative">
        <Input
          placeholder="Agregar producto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <div className="shadow-elevated absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {productSuggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addExistingProduct(p)}
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
                  // text-base (16px), no text-xs: en iOS Safari un select
                  // mas chico hace auto-zoom al tocarlo.
                  className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-base text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
              disabled={adding}
              className="text-brand-600 block w-full border-t border-zinc-200 px-3 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
            >
              + Agregar &quot;{query.trim()}&quot;
            </button>
          </div>
        )}
      </form>

      <RestockChips
        title="Se están por acabar"
        suggestions={suggestions}
        onAdd={(s) =>
          addExistingProduct({
            id: s.product_id!,
            name: s.name ?? "Producto",
            unit_label: s.unit_label ?? "unidad",
            category_id: null,
          })
        }
      />

      {items.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          La lista está vacía. Agregá tu primer producto arriba.
        </p>
      )}

      {grouped.map((group) => (
        <div key={group.label}>
          <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            {group.label}
          </h2>
          <ul className="shadow-soft overflow-hidden rounded-xl border border-zinc-200/70 dark:border-zinc-800">
            {group.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-1 border-b border-zinc-100 bg-white pr-1 pl-1 transition-colors last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
              >
                <button
                  type="button"
                  onClick={() => toggleChecked(item)}
                  aria-label={item.checked ? "Desmarcar" : "Marcar como conseguido"}
                  className="flex h-11 w-11 shrink-0 select-none items-center justify-center"
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                      item.checked
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {item.checked && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 animate-[check-in_0.15s_ease-out]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                </button>

                <span
                  className={`min-w-0 flex-1 truncate py-2.5 text-sm transition-colors ${item.checked ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"}`}
                >
                  {item.products?.name ?? "Producto"}
                </span>

                <div className="flex shrink-0 items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <IconButton onClick={() => changeQuantity(item, -1)} aria-label="Restar">
                    −
                  </IconButton>
                  <span className="w-8 text-center tabular-nums">
                    {item.quantity}
                    <span className="ml-0.5 text-xs text-zinc-400">
                      {item.products?.unit_label}
                    </span>
                  </span>
                  <IconButton onClick={() => changeQuantity(item, 1)} aria-label="Sumar">
                    +
                  </IconButton>
                </div>

                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  aria-label="Quitar de la lista"
                  className="flex h-11 w-11 shrink-0 select-none items-center justify-center text-zinc-400 active:text-red-500"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {checkedCount > 0 && (
        // No es bottom-16 fijo: la altura real del nav de abajo varía con
        // env(safe-area-inset-bottom) (iPhone con home indicator suman
        // ~34px) — con un valor fijo este botón queda tapado por el nav.
        <div
          className="sticky z-10"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          <Link href="/comprar">
            <Button className="shadow-elevated w-full">
              Confirmar compra ({checkedCount})
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
