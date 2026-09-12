"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui";

const BANNER_DISMISS_KEY = "listasuper:stock-estimado-banner-dismissed";

type Product = {
  id: string;
  name: string;
  unit_label: string;
  category_id: string | null;
  quantity_on_hand: number;
  low_stock_threshold: number | null;
  restock_cycle_days: number | null;
  last_restocked_at: string | null;
};

type Category = { id: string; name: string; sort_order: number };

const LAST_RESTOCK_FMT = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

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
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editingSettingsId, setEditingSettingsId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [cycleDraft, setCycleDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  // Renombrar un producto reescribe cómo se ve TODA su compra pasada
  // (nombre, no id, es lo que se muestra en Historial/Reportes) -- por
  // eso, a diferencia de umbral/ciclo/categoría, un cambio de nombre no
  // se guarda directo: pasa primero por esta confirmación explícita.
  const [renameConfirm, setRenameConfirm] = useState<{ id: string; newName: string } | null>(
    null,
  );
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBannerDismissed(window.localStorage.getItem(BANNER_DISMISS_KEY) === "1");
    } catch {
      // Sin acceso a localStorage, mejor mostrar el banner de más.
    }
  }, []);

  function dismissBanner() {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem(BANNER_DISMISS_KEY, "1");
    } catch {
      // No es grave si no se guarda.
    }
  }

  const hasEstimatedStock = useMemo(
    () => initialProducts.some((p) => !p.last_restocked_at && p.quantity_on_hand > 0),
    [initialProducts],
  );

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const searched = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.trim().toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  // Chips de categoría: con 110+ productos en 12 categorías (verificado
  // sobre el hogar real), scrollear buscando una categoría a ojo es
  // lento -- el conteo por chip se calcula sobre `searched` (después del
  // texto de búsqueda, antes de categoría/bajo stock) para que refleje
  // "cuántos hay en esta categoría dado lo que ya tipeaste", no un
  // número fijo que no cambia mientras buscás.
  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of searched) {
      const key = p.category_id ?? "_sin_categoria";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const chips = categories
      .filter((c) => counts.has(c.id))
      .map((c) => ({ key: c.id, label: c.name, count: counts.get(c.id)! }));
    if (counts.has("_sin_categoria")) {
      chips.push({ key: "_sin_categoria", label: "Otros", count: counts.get("_sin_categoria")! });
    }
    return chips;
  }, [searched, categories]);

  const filtered = useMemo(() => {
    return searched.filter((p) => {
      if (categoryFilter) {
        const key = p.category_id ?? "_sin_categoria";
        if (key !== categoryFilter) return false;
      }
      if (lowStockOnly && p.quantity_on_hand > 1) return false;
      return true;
    });
  }, [searched, categoryFilter, lowStockOnly]);

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

    const { error } = await supabase.rpc("adjust_stock", {
      p_household_id: householdId,
      p_product_id: product.id,
      p_delta: realDelta,
      p_reason: "manual_adjust",
    });

    // Sin esto, si el RPC fallaba (red, error del server) el cambio
    // optimista de arriba quedaba visualmente aplicado aunque el server
    // nunca lo haya guardado -- la pantalla mostraba un número que no
    // era real. Se deshace el cambio local para que vuelva a coincidir.
    if (error) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, quantity_on_hand: product.quantity_on_hand } : p,
        ),
      );
    }
  }

  // Umbral de stock y ciclo de compra se editan juntos en un solo panel
  // (antes eran dos disparadores separados siempre visibles por
  // producto — con 140 productos era mucho texto de "sin configurar"
  // para alguien que recién entra a la app). Ver vista
  // product_replenishment (columna restock_reason: 'umbral_manual' o
  // 'ciclo_de_compra' — este último sirve para productos que se compran
  // por hábito en un intervalo mas o menos fijo, ej. aceite de oliva 1
  // vez por mes, independientemente de cuantas unidades queden).
  function startEditingSettings(product: Product) {
    setEditingSettingsId(product.id);
    setNameDraft(product.name);
    setThresholdDraft(
      product.low_stock_threshold !== null ? String(product.low_stock_threshold) : "",
    );
    setCycleDraft(
      product.restock_cycle_days !== null ? String(product.restock_cycle_days) : "",
    );
    setCategoryDraft(product.category_id ?? "");
    setRenameConfirm(null);
    setRenameError(null);
  }

  // Guarda umbral/ciclo/categoría (y el nombre nuevo, si ya se confirmó un
  // cambio de nombre o si no hubo ninguno). No hace ningún chequeo de
  // nombre -- eso ya se resolvió antes de llamar a esta función.
  async function commitSettings(product: Product, newName: string) {
    const parsedThreshold = thresholdDraft.trim() === "" ? null : Number(thresholdDraft);
    const threshold =
      parsedThreshold !== null && !isNaN(parsedThreshold) && parsedThreshold >= 0
        ? parsedThreshold
        : null;
    const parsedCycle = cycleDraft.trim() === "" ? null : Number(cycleDraft);
    const cycle = parsedCycle !== null && !isNaN(parsedCycle) && parsedCycle > 0 ? parsedCycle : null;
    const category = categoryDraft || null;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              name: newName,
              low_stock_threshold: threshold,
              restock_cycle_days: cycle,
              category_id: category,
            }
          : p,
      ),
    );
    setEditingSettingsId(null);
    setRenameConfirm(null);

    await supabase
      .from("products")
      .update({
        name: newName,
        low_stock_threshold: threshold,
        restock_cycle_days: cycle,
        category_id: category,
      })
      .eq("id", product.id);
  }

  function saveSettings(product: Product) {
    setRenameError(null);
    const trimmedName = nameDraft.trim();

    if (!trimmedName || trimmedName === product.name) {
      commitSettings(product, product.name);
      return;
    }

    // El nombre es lo único de este panel que también reescribe cómo se
    // ve el historial pasado (Historial/Reportes muestran el nombre
    // actual del producto, no el que tenía en el momento de la compra).
    // Antes de tocarlo: si el nombre nuevo ya es el de OTRO producto
    // existente, es casi seguro un error (se quiso buscar ese producto,
    // no renombrar este) -- se bloquea en vez de dejar dos productos con
    // el mismo nombre, misma regla que ya usan Lista y Comprar al crear.
    const duplicate = products.find(
      (p) => p.id !== product.id && p.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      setRenameError(
        `Ya existe un producto llamado "${duplicate.name}". Para no duplicarlo, buscalo en Lista o Comprar en vez de renombrar este.`,
      );
      return;
    }

    setRenameConfirm({ id: product.id, newName: trimmedName });
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

      {(categoryChips.length > 0 || lowStockOnly) && (
        // Sin bleed a los bordes (-mx/px fijo): el padding real de <main>
        // en el layout usa env(safe-area-inset-*), que en dispositivos con
        // notch supera 1rem -- un margen negativo fijo hubiera dejado un
        // hueco o un corte según el dispositivo. Se scrollea dentro del
        // ancho normal del contenido, no borde a borde.
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("")}
            className={`min-h-8 shrink-0 select-none touch-manipulation rounded-full px-3 text-xs font-medium ${
              categoryFilter === ""
                ? "bg-[#16A34A] text-white"
                : "bg-zinc-100 text-zinc-600 active:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:active:bg-zinc-800"
            }`}
          >
            Todas
          </button>
          {categoryChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategoryFilter((prev) => (prev === c.key ? "" : c.key))}
              className={`min-h-8 shrink-0 select-none touch-manipulation rounded-full px-3 text-xs font-medium ${
                categoryFilter === c.key
                  ? "bg-[#16A34A] text-white"
                  : "bg-zinc-100 text-zinc-600 active:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:active:bg-zinc-800"
              }`}
            >
              {c.label} <span className="opacity-70">{c.count}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={`min-h-8 shrink-0 select-none touch-manipulation rounded-full border px-3 text-xs font-medium ${
              lowStockOnly
                ? "border-amber-600 bg-amber-500 text-white"
                : "border-amber-200 bg-amber-50 text-amber-700 active:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:active:bg-amber-900"
            }`}
          >
            Bajo stock
          </button>
        </div>
      )}

      {hasEstimatedStock && !bannerDismissed && (
        <div className="flex items-start gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <span className="flex-1">
            Las cantidades y los avisos arrancaron como un cálculo a partir
            de tu historial de compras, no son un inventario exacto. Tocá
            cualquier número, umbral o ciclo para ajustarlo a como compran
            ustedes.
          </span>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Cerrar aviso"
            className="shrink-0 select-none touch-manipulation rounded-full px-1 text-zinc-400 active:text-zinc-600 dark:active:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}

      {grouped.length === 0 && products.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          Todavía no hay productos. Se van a ir sumando solos a medida que
          registrés compras.
        </p>
      )}

      {grouped.length === 0 && products.length > 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          Ningún producto coincide con el filtro.
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
              const isEditingSettings = editingSettingsId === p.id;
              const settingsSummary = [
                p.low_stock_threshold !== null ? `Avisar con ${p.low_stock_threshold}` : null,
                p.restock_cycle_days !== null ? `cada ${p.restock_cycle_days} días` : null,
              ]
                .filter(Boolean)
                .join(" · ");
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
                    {p.last_restocked_at ? (
                      <p className="text-xs text-zinc-400">
                        Última compra: {LAST_RESTOCK_FMT.format(new Date(p.last_restocked_at))}
                      </p>
                    ) : (
                      p.quantity_on_hand > 0 && (
                        // Este número vino de la carga inicial (seed_initial_stock,
                        // Fase 6), no de una compra registrada todavía. Sin esta
                        // aclaración se ve idéntico a un dato real y, si está mal,
                        // parece un error de la app en vez de un punto de partida
                        // editable -- tocar +/- ya lo corrige.
                        <p className="text-xs text-zinc-400">
                          Cantidad inicial, sin compra registrada todavía
                        </p>
                      )
                    )}
                    {!isEditingSettings && settingsSummary && (
                      <button
                        type="button"
                        onClick={() => startEditingSettings(p)}
                        className="text-xs text-zinc-400 underline decoration-dotted active:text-zinc-600 dark:active:text-zinc-300"
                      >
                        {settingsSummary}
                      </button>
                    )}
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
                    onClick={() =>
                      isEditingSettings ? setEditingSettingsId(null) : startEditingSettings(p)
                    }
                    aria-label={`Configurar avisos de ${p.name}`}
                    className={`flex h-9 w-9 shrink-0 select-none items-center justify-center ${
                      isEditingSettings ? "text-[#16A34A]" : "text-zinc-400 active:text-zinc-600 dark:active:text-zinc-300"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                    </svg>
                  </button>
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

                {isEditingSettings && (
                  <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-2.5 pl-[1.375rem] dark:bg-zinc-900/60">
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      Nombre
                      <input
                        type="text"
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => {
                          setNameDraft(e.target.value);
                          setRenameError(null);
                          setRenameConfirm(null);
                        }}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                    {renameError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{renameError}</p>
                    )}
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      Categoría
                      <select
                        value={categoryDraft}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        <option value="">Sin categoría (Otros)</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      Avisar cuando queden
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={thresholdDraft}
                        onChange={(e) => setThresholdDraft(e.target.value)}
                        placeholder="sin aviso"
                        className="h-9 w-20 rounded-lg border border-zinc-300 px-2 text-center text-base dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      Se compra cada
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={cycleDraft}
                        onChange={(e) => setCycleDraft(e.target.value)}
                        placeholder="sin ciclo"
                        className="h-9 w-20 rounded-lg border border-zinc-300 px-2 text-center text-base dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      días
                    </label>
                    {renameConfirm?.id === p.id ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        <span>
                          ¿Cambiar el nombre a &quot;{renameConfirm.newName}&quot;? Así se va a
                          ver también en toda la compra pasada de este producto. Si en realidad
                          es un producto distinto, cancelá y agregalo aparte en Lista o Comprar.
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => commitSettings(p, renameConfirm.newName)}
                            className="min-h-8 select-none touch-manipulation rounded-full bg-amber-600 px-3 text-xs font-medium text-white active:bg-amber-700"
                          >
                            Sí, cambiar
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenameConfirm(null)}
                            className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-amber-700 dark:text-amber-300"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveSettings(p)}
                          className="min-h-9 select-none touch-manipulation rounded-full bg-[#16A34A] px-3 text-xs font-medium text-white active:bg-[#15803D]"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSettingsId(null);
                            setRenameConfirm(null);
                            setRenameError(null);
                          }}
                          className="min-h-9 select-none touch-manipulation rounded-full px-2 text-xs text-zinc-500"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
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
