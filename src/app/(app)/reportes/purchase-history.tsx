"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";

type PurchaseItem = {
  id: string;
  quantity: number;
  products: { name: string; unit_label: string } | null;
};

type Purchase = {
  id: string;
  purchased_at: string;
  stores: { name: string } | null;
  purchase_items: PurchaseItem[];
};

type DayGroup = {
  dayKey: string;
  purchases: Purchase[];
  itemCount: number;
  storesLabel: string;
};

// Zona horaria fija (no la del dispositivo) para que "mismo día" signifique
// lo mismo sin importar desde dónde se mire, y para no partir mal una
// compra cargada de noche cerca de la medianoche UTC.
const TIMEZONE = "America/Argentina/Buenos_Aires";

// "en-CA" da como resultado el formato AAAA-MM-DD directo, útil como clave
// de agrupación estable (no para mostrar, ver DATE_FMT para eso).
const DAY_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: TIMEZONE,
});

const TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIMEZONE,
});

// Unifica compras cargadas por tandas el mismo día en una sola fila (a
// pedido del usuario: cargar de a poco durante el día antes no generaba
// "la compra del día" sino una fila por cada tanda). El array ya viene
// ordenado desc por purchased_at desde el server, y como acá solo se abre
// una entrada nueva en el Map la primera vez que aparece cada día, el
// resultado conserva ese mismo orden sin necesidad de volver a ordenar.
function groupByDay(purchases: Purchase[]): DayGroup[] {
  const byDay = new Map<string, Purchase[]>();
  for (const p of purchases) {
    const key = DAY_KEY_FMT.format(new Date(p.purchased_at));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(p);
    else byDay.set(key, [p]);
  }

  return [...byDay.entries()].map(([dayKey, dayPurchases]) => {
    const itemCount = dayPurchases.reduce(
      (sum, p) => sum + p.purchase_items.length,
      0,
    );
    const storeNames = [
      ...new Set(
        dayPurchases
          .map((p) => p.stores?.name)
          .filter((n): n is string => !!n),
      ),
    ];
    const storesLabel =
      storeNames.length === 0
        ? "Sin especificar"
        : storeNames.length === 1
          ? storeNames[0]
          : storeNames.join(", ");

    return { dayKey, purchases: dayPurchases, itemCount, storesLabel };
  });
}

function ItemRow({ item }: { item: PurchaseItem }) {
  return (
    <li className="flex items-center gap-2 px-4 py-2 text-sm">
      <span className="flex-1 text-zinc-700 dark:text-zinc-300">
        {item.products?.name ?? "Producto"}
      </span>
      <span className="text-xs text-zinc-400">
        {item.quantity} {item.products?.unit_label ?? ""}
      </span>
    </li>
  );
}

// El array de arriba (`purchases`) viene del server acotado a las últimas
// 30 compras (ver reportes/page.tsx) -- suficiente para mostrar el
// historial reciente, pero exportar tiene que traer todo lo que haya (o el
// rango que se pida), así que la exportación hace su propia consulta desde
// el cliente en vez de reusar ese array.
const RANGE_TZ_OFFSET = "-03:00"; // Argentina: UTC-3 fijo, sin horario de verano desde 2009.

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportPanel({
  householdId,
  householdName,
}: {
  householdId: string;
  householdName: string;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    const supabase = createClient();
    let query = supabase
      .from("purchases")
      .select(
        "id, purchased_at, stores(name), purchase_items(id, quantity, products(name, unit_label))",
      )
      .eq("household_id", householdId)
      .order("purchased_at", { ascending: true });

    // Los <input type="date"> dan "AAAA-MM-DD" sin zona horaria -- armar acá
    // el límite completo del día en la zona del hogar evita el desfasaje
    // de un día que daría comparar eso contra purchased_at (timestamptz) sin
    // conversión.
    if (fromDate) query = query.gte("purchased_at", `${fromDate}T00:00:00${RANGE_TZ_OFFSET}`);
    if (toDate) query = query.lte("purchased_at", `${toDate}T23:59:59.999${RANGE_TZ_OFFSET}`);

    const { data, error } = await query.returns<Purchase[]>();
    setExporting(false);
    if (error || !data) {
      setExportError("No se pudo exportar. Probá de nuevo.");
      return;
    }

    const hasRange = !!(fromDate || toDate);
    downloadJson(
      `listasuper-historial${hasRange ? `_${fromDate || "inicio"}_a_${toDate || "hoy"}` : "_completo"}.json`,
      {
        hogar: householdName,
        exportado_el: new Date().toISOString(),
        rango: hasRange ? { desde: fromDate || null, hasta: toDate || null } : "todo",
        cantidad_compras: data.length,
        compras: data.map((p) => ({
          id: p.id,
          fecha: p.purchased_at,
          supermercado: p.stores?.name ?? null,
          items: p.purchase_items.map((it) => ({
            producto: it.products?.name ?? null,
            unidad: it.products?.unit_label ?? null,
            cantidad: it.quantity,
          })),
        })),
      },
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Exportar historial (JSON)
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Dejá las fechas vacías para exportar todo, o elegí un rango.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          Desde
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            // text-base (16px), no text-xs: en iOS Safari un input mas
            // chico hace auto-zoom al tocarlo.
            className="h-9 rounded-lg border border-zinc-300 px-2 text-base text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          Hasta
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 rounded-lg border border-zinc-300 px-2 text-base text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={exporting} onClick={handleExport}>
          {exporting ? "Exportando…" : fromDate || toDate ? "Exportar rango" : "Exportar todo"}
        </Button>
        {(fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={exporting}
            onClick={() => {
              setFromDate("");
              setToDate("");
            }}
          >
            Limpiar
          </Button>
        )}
      </div>

      {exportError && <p className="text-xs text-red-600 dark:text-red-400">{exportError}</p>}

      <p className="text-xs text-zinc-400">
        En iPhone puede abrirse en una pestaña nueva en vez de descargarse
        directo — desde ahí, compartir y elegir &quot;Guardar en
        Archivos&quot;.
      </p>
    </Card>
  );
}

// No existe un objeto "lista semanal" propio en el modelo de datos (la
// lista compartida es una sola, continua) — cada fila de `purchases` es
// lo más parecido a "una compra puntual"; este historial las agrupa por
// día para mostrar "la compra del día" completa, con el detalle de cada
// tanda original disponible al expandir cuando hubo más de una.
export function PurchaseHistory({
  purchases,
  householdId,
  householdName,
}: {
  purchases: Purchase[];
  householdId: string;
  householdName: string;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const days = useMemo(() => groupByDay(purchases), [purchases]);

  if (purchases.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">
        Todavía no registraste ninguna compra. Las vas a ver acá apenas
        confirmes la primera desde Comprar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ExportPanel householdId={householdId} householdName={householdName} />
      <ul className="flex flex-col gap-2">
      {days.map((group) => {
        const expanded = expandedDay === group.dayKey;
        const multi = group.purchases.length > 1;
        return (
          <li key={group.dayKey}>
            <Card className="overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setExpandedDay(expanded ? null : group.dayKey)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-zinc-50 dark:active:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {DATE_FMT.format(new Date(group.purchases[0].purchased_at))}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {group.storesLabel} · {group.itemCount} producto
                    {group.itemCount === 1 ? "" : "s"}
                    {multi ? ` (${group.purchases.length} compras)` : ""}
                  </p>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {expanded && (
                <div className="border-t border-zinc-100 dark:border-zinc-900">
                  {multi
                    ? group.purchases.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
                        >
                          <div className="px-4 pt-2.5 pb-1 text-xs text-zinc-500">
                            {TIME_FMT.format(new Date(purchase.purchased_at))} ·{" "}
                            {purchase.stores?.name ?? "Sin especificar"}
                          </div>
                          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                            {purchase.purchase_items.map((item) => (
                              <ItemRow key={item.id} item={item} />
                            ))}
                          </ul>
                        </div>
                      ))
                    : (
                        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                          {group.purchases[0].purchase_items.map((item) => (
                            <ItemRow key={item.id} item={item} />
                          ))}
                        </ul>
                      )}
                </div>
              )}
            </Card>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
