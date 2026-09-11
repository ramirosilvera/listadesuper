"use client";

import { useState } from "react";
import { StockClient } from "./stock-client";
import { VencimientosTab } from "./vencimientos-tab";

type Product = {
  id: string;
  name: string;
  unit_label: string;
  category_id: string | null;
  quantity_on_hand: number;
  low_stock_threshold: number | null;
};

type Category = { id: string; name: string; sort_order: number };

type Expiration = {
  id: string;
  product_name: string | null;
  unit_label: string | null;
  expiration_date: string | null;
  quantity: number | null;
  days_until: number | null;
  level: string | null;
};

export function StockTabs({
  householdId,
  products,
  categories,
  expirationsCount,
  initialExpirations,
}: {
  householdId: string;
  products: Product[];
  categories: Category[];
  expirationsCount: number;
  initialExpirations: Expiration[];
}) {
  const [tab, setTab] = useState<"stock" | "vencimientos">("stock");
  const urgentCount = initialExpirations.filter(
    (e) => e.level === "expired" || e.level === "red",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-full bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setTab("stock")}
          className={`flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${tab === "stock" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Stock
        </button>
        <button
          type="button"
          onClick={() => setTab("vencimientos")}
          className={`relative flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${tab === "vencimientos" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Vencimientos
          {expirationsCount > 0 && (
            <span
              className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs text-white ${urgentCount > 0 ? "bg-red-500" : "bg-zinc-400"}`}
            >
              {expirationsCount}
            </span>
          )}
        </button>
      </div>

      {tab === "stock" ? (
        <StockClient householdId={householdId} products={products} categories={categories} />
      ) : (
        <VencimientosTab initialExpirations={initialExpirations} />
      )}
    </div>
  );
}
