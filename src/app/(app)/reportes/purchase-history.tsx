"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";

type PurchaseItem = {
  id: string;
  quantity: number;
  unit_price: number | null;
  subtotal: number | null;
  products: { name: string; unit_label: string } | null;
};

type Purchase = {
  id: string;
  purchased_at: string;
  total_amount: number | null;
  stores: { name: string } | null;
  purchase_items: PurchaseItem[];
};

type DayGroup = {
  dayKey: string;
  purchases: Purchase[];
  totalAmount: number | null;
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

function money(n: number) {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

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
    const amounts = dayPurchases
      .map((p) => p.total_amount)
      .filter((a): a is number => a != null);
    const totalAmount =
      amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) : null;
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

    return { dayKey, purchases: dayPurchases, totalAmount, itemCount, storesLabel };
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
      {item.subtotal != null && (
        <span className="w-16 text-right text-zinc-500">
          {money(item.subtotal)}
        </span>
      )}
    </li>
  );
}

// No existe un objeto "lista semanal" propio en el modelo de datos (la
// lista compartida es una sola, continua) — cada fila de `purchases` es
// lo más parecido a "una compra puntual"; este historial las agrupa por
// día para mostrar "la compra del día" completa, con el detalle de cada
// tanda original disponible al expandir cuando hubo más de una.
export function PurchaseHistory({ purchases }: { purchases: Purchase[] }) {
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
                {group.totalAmount != null && (
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {money(group.totalAmount)}
                  </span>
                )}
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
                          <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-xs text-zinc-500">
                            <span>
                              {TIME_FMT.format(new Date(purchase.purchased_at))} ·{" "}
                              {purchase.stores?.name ?? "Sin especificar"}
                            </span>
                            {purchase.total_amount != null && (
                              <span>{money(purchase.total_amount)}</span>
                            )}
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
  );
}
