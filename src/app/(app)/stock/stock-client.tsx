"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, IconButton, Input } from "@/components/ui";

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
  needs_restock: boolean;
  cycle_urgency: string | null;
  restock_snoozed_until: string | null;
};

type Category = { id: string; name: string; sort_order: number };

const LAST_RESTOCK_FMT = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

// "Vacío" siempre se marca (0 unidades es un hecho, no depende de gusto).
// "Bajo" depende de low_stock_threshold (cada quien configura cuánto
// quiere tener de ese producto), de needs_restock (marca manual de "está
// abierto y queda poco" -- Fase 25), o de cycle_urgency en 'vencido'/
// 'esta_semana' (falta poco o nada para el próximo ciclo esperado de
// compra -- Fase 8, con margen desde Fase 29). Son distintas formas de
// detectar lo mismo, ya unificadas en
// product_replenishment.should_restock -- acá se reusa esa misma unión,
// no se define "poco stock" por cuarta vez.
//
// Deliberadamente NO se resetea quantity_on_hand a 0 cuando se cumple el
// ciclo (se evaluó y se descartó, ver docs/plan.md): el ciclo es un
// promedio de hábito, no una medición real -- forzar el número a 0
// fabricaría una cantidad falsa cada vez que en la práctica todavía
// quedara algo, y esa cantidad falsa quedaría arrastrada para siempre en
// el conteo (nadie la corrige, es justo lo que se pidió automatizar).
// Cycle_alert dispara la MISMA alerta visual sin tocar el número real.
function stockLevel(
  p: Pick<Product, "quantity_on_hand" | "low_stock_threshold" | "needs_restock" | "cycle_urgency">,
) {
  if (p.quantity_on_hand <= 0) return "empty" as const;
  if (p.needs_restock || p.cycle_urgency === "vencido" || p.cycle_urgency === "esta_semana") {
    return "low" as const;
  }
  if (p.low_stock_threshold !== null && p.quantity_on_hand <= p.low_stock_threshold) {
    return "low" as const;
  }
  return "ok" as const;
}

// Fase 30: "posponer" -- para productos de consumo irregular donde ni el
// ciclo ni la predicción por consumo aciertan bien (Consejo con el
// usuario). Solo silencia esas dos inferencias automáticas; el chequeo es
// por fecha, no por un booleano guardado, para que "vencer" no dependa de
// ningún job en el server.
function isSnoozed(p: Pick<Product, "restock_snoozed_until">): boolean {
  return p.restock_snoozed_until !== null && new Date(p.restock_snoozed_until) > new Date();
}

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
  const [unitDraft, setUnitDraft] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [cycleDraft, setCycleDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  // Nombre y unidad son los dos campos de este panel que no se guardan
  // directo: un cambio de nombre reescribe cómo se ve TODA la compra
  // pasada de este producto (Historial/Reportes muestran el nombre
  // actual, no el que tenía en el momento de la compra), y un cambio de
  // unidad puede volver ambiguas las cantidades YA cargadas (¿"2" sigue
  // significando lo mismo si antes era "litros" y ahora es "medio
  // litro"?) -- la app no tiene forma de saber si hace falta convertir
  // los números existentes o no, solo la familia lo sabe.
  const [confirmChange, setConfirmChange] = useState<{
    id: string;
    newName: string;
    newUnit: string;
    nameChanged: boolean;
    unitChanged: boolean;
  } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [snoozingId, setSnoozingId] = useState<string | null>(null);

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
      if (lowStockOnly && stockLevel(p) === "ok") return false;
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
    setUnitDraft(product.unit_label);
    setThresholdDraft(
      product.low_stock_threshold !== null ? String(product.low_stock_threshold) : "",
    );
    setCycleDraft(
      product.restock_cycle_days !== null ? String(product.restock_cycle_days) : "",
    );
    setCategoryDraft(product.category_id ?? "");
    setConfirmChange(null);
    setRenameError(null);
  }

  // Guarda umbral/ciclo/categoría (y nombre/unidad nuevos, si ya se
  // confirmó el cambio o si no hubo ninguno). No hace ningún chequeo de
  // nombre/unidad -- eso ya se resolvió antes de llamar a esta función.
  async function commitSettings(product: Product, newName: string, newUnit: string) {
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
              unit_label: newUnit,
              low_stock_threshold: threshold,
              restock_cycle_days: cycle,
              category_id: category,
            }
          : p,
      ),
    );
    setEditingSettingsId(null);
    setConfirmChange(null);

    await supabase
      .from("products")
      .update({
        name: newName,
        unit_label: newUnit,
        low_stock_threshold: threshold,
        restock_cycle_days: cycle,
        category_id: category,
      })
      .eq("id", product.id);
  }

  function saveSettings(product: Product) {
    setRenameError(null);
    const trimmedName = nameDraft.trim() || product.name;
    const trimmedUnit = unitDraft.trim() || product.unit_label;
    const nameChanged = trimmedName !== product.name;
    const unitChanged = trimmedUnit !== product.unit_label;

    if (nameChanged) {
      // El nombre reescribe cómo se ve el historial pasado (Historial/
      // Reportes muestran el nombre actual del producto, no el que tenía
      // en el momento de la compra). Antes de tocarlo: si el nombre nuevo
      // ya es el de OTRO producto existente, es casi seguro un error (se
      // quiso buscar ese producto, no renombrar este) -- se bloquea en
      // vez de dejar dos productos con el mismo nombre, misma regla que
      // ya usan Lista y Comprar al crear.
      const duplicate = products.find(
        (p) => p.id !== product.id && p.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (duplicate) {
        setRenameError(
          `Ya existe un producto llamado "${duplicate.name}". Para no duplicarlo, buscalo en Lista o Comprar en vez de renombrar este.`,
        );
        return;
      }
    }

    if (nameChanged || unitChanged) {
      setConfirmChange({ id: product.id, newName: trimmedName, newUnit: trimmedUnit, nameChanged, unitChanged });
      return;
    }

    commitSettings(product, product.name, product.unit_label);
  }

  // Toggle de un solo toque, sin confirmación: a diferencia de renombrar
  // o archivar, marcar/desmarcar "para reponer" no reescribe historial ni
  // saca nada del catálogo -- es totalmente reversible con el mismo toque,
  // así que no amerita la fricción de un paso de confirmación.
  async function toggleNeedsRestock(product: Product) {
    const next = !product.needs_restock;
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, needs_restock: next } : p)),
    );
    const { error } = await supabase
      .from("products")
      .update({ needs_restock: next })
      .eq("id", product.id);
    if (error) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, needs_restock: product.needs_restock } : p)),
      );
    }
  }

  // Posponer/cancelar (Fase 30): a diferencia de needs_restock (un campo
  // propio en products), esto vive en product_suggestion_dismissals -- no
  // hay un valor local que invertir de forma optimista sin duplicar la
  // lógica de fecha de la vista, así que se pide el estado real recién
  // calculado después de la RPC en vez de adivinarlo.
  async function toggleSnooze(product: Product) {
    setSnoozingId(product.id);
    const { error } = isSnoozed(product)
      ? await supabase.rpc("unsnooze_restock", { p_product_id: product.id })
      : await supabase.rpc("snooze_restock", { p_product_id: product.id });

    if (!error) {
      const { data } = await supabase
        .from("product_replenishment")
        .select("cycle_urgency, restock_snoozed_until")
        .eq("product_id", product.id)
        .maybeSingle();
      if (data) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id
              ? {
                  ...p,
                  cycle_urgency: data.cycle_urgency,
                  restock_snoozed_until: data.restock_snoozed_until,
                }
              : p,
          ),
        );
      }
    }
    setSnoozingId(null);
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
        // Antes esto era una fila de chips con scroll horizontal -- con
        // 12 categorías reales (algunas con nombres largos, ej. "Lácteos,
        // huevos y fiambres") resultó incómodo de recorrer. Envolver los
        // chips en varias líneas (flex-wrap) era la otra opción, pero con
        // esa cantidad de categorías largas hubiera ocupado 4-5 líneas
        // completas antes de llegar a un solo producto -- demasiado alto
        // para lo que en realidad es "elegí una categoría". Un <select>
        // nativo resuelve las dos cosas: una sola línea, sin scroll
        // lateral, y en el celular abre una hoja/rueda táctil grande y
        // cómoda (no un desplegable chico) -- además reusa el mismo tipo
        // de control que ya usan el editor de categoría de cada producto
        // y el alta de producto nuevo en Lista/Comprar, en vez de sumar
        // un cuarto patrón de selección distinto a los ya existentes.
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            // text-base (16px), no text-sm: un control mas chico hace que
            // iOS Safari haga auto-zoom al tocarlo (mismo motivo que ya
            // documenta comprar-client.tsx en el input de cantidad).
            className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-base text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Todas las categorías</option>
            {categoryChips.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={`h-10 shrink-0 select-none touch-manipulation rounded-lg border px-3 text-sm font-medium ${
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
          <ul className="shadow-soft overflow-hidden rounded-xl border border-zinc-200/70 dark:border-zinc-800">
            {group.items.map((p) => {
              const level = stockLevel(p);
              const isEditingSettings = editingSettingsId === p.id;
              const settingsSummary = [
                p.low_stock_threshold !== null ? `Avisar con ${p.low_stock_threshold}` : null,
                p.restock_cycle_days !== null ? `cada ${p.restock_cycle_days} días` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              // Antes esto vivía junto al nombre en una sola fila con la
              // cantidad y los 3 botones de acción -- 5 elementos de ancho
              // fijo (~250px) le dejaban al nombre menos de 60px reales en
              // un celular angosto, y el texto terminaba partido letra por
              // letra ("Aceite" / "de" / "girasol" en líneas separadas,
              // reportado por el usuario con una captura). Ahora el nombre
              // tiene su propia fila a ancho completo (con truncate como
              // resguardo, no como recurso principal: ningún nombre real
              // del catálogo se acerca a ese límite) y los controles bajan
              // a una fila propia.
              // Fase 29: franjas de anticipo en vez de un aviso binario
              // "ya se cumplió el ciclo, sí o no" -- "esta semana" da el
              // mismo margen que antes se lograba a mano bajando el
              // número de días configurado. "La semana que viene" es a
              // propósito un texto neutro (ver estilo más abajo, sin
              // ámbar): es información, no una alerta.
              const snoozed = isSnoozed(p);
              const statusText = p.needs_restock
                ? "Marcado para reponer"
                : p.cycle_urgency === "vencido"
                  ? "Hace tiempo no lo comprás"
                  : p.cycle_urgency === "esta_semana"
                    ? "Tocaría reponer esta semana"
                    : p.cycle_urgency === "proxima_semana"
                      ? "Reponer la semana que viene"
                      : snoozed
                        ? `Pospuesto hasta el ${LAST_RESTOCK_FMT.format(new Date(p.restock_snoozed_until!))}`
                        : p.last_restocked_at
                          ? `Última compra: ${LAST_RESTOCK_FMT.format(new Date(p.last_restocked_at))}`
                          : p.quantity_on_hand > 0
                            ? "Cantidad inicial (estimado)"
                            : null;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-1 border-b border-zinc-100 bg-white px-3 py-2.5 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
                >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      level === "empty"
                        ? "bg-red-500"
                        : level === "low"
                          ? "bg-amber-500"
                          : "bg-brand-600"
                    }`}
                    aria-hidden
                  />
                  <p className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-50">
                    {p.name}
                  </p>
                </div>

                {(statusText || settingsSummary) && (
                  <div className="flex flex-wrap items-center gap-x-1.5 pl-[1.125rem] text-xs">
                    {statusText && (
                      <span
                        className={
                          p.needs_restock ||
                          p.cycle_urgency === "vencido" ||
                          p.cycle_urgency === "esta_semana"
                            ? "font-medium text-amber-600 dark:text-amber-400"
                            : "text-zinc-400"
                        }
                      >
                        {statusText}
                      </span>
                    )}
                    {statusText && settingsSummary && !isEditingSettings && (
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    )}
                    {!isEditingSettings && settingsSummary && (
                      <button
                        type="button"
                        onClick={() => startEditingSettings(p)}
                        className="text-zinc-400 underline decoration-dotted active:text-zinc-600 dark:active:text-zinc-300"
                      >
                        {settingsSummary}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pl-[1.125rem]">
                  <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                    <IconButton onClick={() => adjust(p, -1)} aria-label="Restar">
                      −
                    </IconButton>
                    <span className="w-9 text-center tabular-nums">
                      {p.quantity_on_hand}
                      <span className="ml-0.5 text-xs text-zinc-400">{p.unit_label}</span>
                    </span>
                    <IconButton onClick={() => adjust(p, 1)} aria-label="Sumar">
                      +
                    </IconButton>
                  </div>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleNeedsRestock(p)}
                      aria-label={
                        p.needs_restock
                          ? `Ya no marcar "${p.name}" para reponer`
                          : `Marcar "${p.name}" para reponer (abierto, queda poco)`
                      }
                      aria-pressed={p.needs_restock}
                      className="flex h-9 w-9 shrink-0 select-none items-center justify-center"
                    >
                      {p.needs_restock ? (
                        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-amber-500 text-white">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </span>
                      ) : (
                        <span className="h-5.5 w-5.5 rounded-md border-2 border-zinc-300 dark:border-zinc-700" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSnooze(p)}
                      disabled={snoozingId === p.id}
                      aria-label={
                        snoozed
                          ? `Dejar de posponer la reposición de "${p.name}"`
                          : `Posponer sugerencias de reposición de "${p.name}" por 30 días`
                      }
                      aria-pressed={snoozed}
                      className="flex h-9 w-9 shrink-0 select-none items-center justify-center disabled:opacity-50"
                    >
                      {snoozed ? (
                        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-zinc-600 text-white dark:bg-zinc-500">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 3" />
                          </svg>
                        </span>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-zinc-400 active:text-zinc-600 dark:active:text-zinc-300" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 3" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        isEditingSettings ? setEditingSettingsId(null) : startEditingSettings(p)
                      }
                      aria-label={`Configurar avisos de ${p.name}`}
                      className={`flex h-9 w-9 shrink-0 select-none items-center justify-center ${
                        isEditingSettings ? "text-brand-600" : "text-zinc-400 active:text-zinc-600 dark:active:text-zinc-300"
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
                </div>

                {confirmArchiveId === p.id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                    <span className="flex-1">
                      ¿Quitar &quot;{p.name}&quot; del catálogo? No va a figurar más en Stock ni en sugeridos para reponer.
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={archiving === p.id}
                      onClick={() => archiveProduct(p)}
                    >
                      {archiving === p.id ? "Quitando…" : "Sí, quitar"}
                    </Button>
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
                          setConfirmChange(null);
                        }}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                    {renameError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{renameError}</p>
                    )}
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      Unidad
                      <input
                        type="text"
                        value={unitDraft}
                        onChange={(e) => {
                          setUnitDraft(e.target.value);
                          setConfirmChange(null);
                        }}
                        placeholder="ej. medio litro, kg, unidad"
                        className="h-9 w-32 rounded-lg border border-zinc-300 px-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      Categoría
                      <select
                        value={categoryDraft}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-base text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
                    {confirmChange?.id === p.id ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        <span>
                          ¿Cambiar{" "}
                          {[
                            confirmChange.nameChanged
                              ? `el nombre a "${confirmChange.newName}"`
                              : null,
                            confirmChange.unitChanged
                              ? `la unidad a "${confirmChange.newUnit}"`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" y ")}
                          ?{" "}
                          {confirmChange.nameChanged &&
                            "Así se va a ver también en toda la compra pasada de este producto. Si en realidad es un producto distinto, cancelá y agregalo aparte en Lista o Comprar. "}
                          {confirmChange.unitChanged &&
                            "La unidad es solo una etiqueta -- no convierte las cantidades ya cargadas. Si antes contabas distinto (por ejemplo, en litros) y la unidad nueva representa otra cantidad física, ajustá vos los números para que sigan significando lo mismo."}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => commitSettings(p, confirmChange.newName, confirmChange.newUnit)}
                            className="min-h-8 select-none touch-manipulation rounded-full bg-amber-600 px-3 text-xs font-medium text-white active:bg-amber-700"
                          >
                            Sí, cambiar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmChange(null)}
                            className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-amber-700 dark:text-amber-300"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => saveSettings(p)}>
                          Guardar
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSettingsId(null);
                            setConfirmChange(null);
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
