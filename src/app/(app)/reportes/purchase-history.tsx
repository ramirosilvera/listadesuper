"use client";

import { useState } from "react";
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

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function money(n: number) {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

// No existe un objeto "lista semanal" propio en el modelo de datos (la
// lista compartida es una sola, continua) — cada fila de `purchases` es
// lo más parecido a "la compra de esa semana", así que este historial
// muestra eso: una por una, con el detalle de qué se compró en cada una.
export function PurchaseHistory({ purchases }: { purchases: Purchase[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      {purchases.map((purchase) => {
        const expanded = expandedId === purchase.id;
        const itemCount = purchase.purchase_items.length;
        return (
          <li key={purchase.id}>
            <Card className="overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : purchase.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-zinc-50 dark:active:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {DATE_FMT.format(new Date(purchase.purchased_at))}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {purchase.stores?.name ?? "Sin especificar"} · {itemCount}{" "}
                    producto{itemCount === 1 ? "" : "s"}
                  </p>
                </div>
                {purchase.total_amount != null && (
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {money(purchase.total_amount)}
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
                <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-900 dark:border-zinc-900">
                  {purchase.purchase_items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 px-4 py-2 text-sm"
                    >
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
                  ))}
                </ul>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
