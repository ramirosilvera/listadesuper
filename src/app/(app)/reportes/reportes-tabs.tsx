"use client";

import { useState } from "react";
import { ReportesClient } from "./reportes-client";
import { PurchaseHistory } from "./purchase-history";
import { SuggestionsPanel, type ProductSuggestion } from "./suggestions-panel";

type CategorySpend = {
  category_id: string | null;
  category_name: string | null;
  total_amount: number | null;
  item_count: number | null;
};

type WeekSpend = { week_start: string | null; total_amount: number | null };

type TopProduct = {
  product_id: string | null;
  product_name: string | null;
  purchase_count: number | null;
};

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

export function ReportesTabs({
  totalSpend30d,
  byCategory,
  byWeek,
  topProducts,
  urgentExpirations,
  restockCount,
  purchases,
  suggestions,
}: {
  totalSpend30d: number;
  byCategory: CategorySpend[];
  byWeek: WeekSpend[];
  topProducts: TopProduct[];
  urgentExpirations: number;
  restockCount: number;
  purchases: Purchase[];
  suggestions: ProductSuggestion[];
}) {
  const [tab, setTab] = useState<"resumen" | "historial" | "sugerencias">("resumen");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-full bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setTab("resumen")}
          className={`flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${tab === "resumen" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Resumen
        </button>
        <button
          type="button"
          onClick={() => setTab("historial")}
          className={`flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${tab === "historial" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Historial
        </button>
        <button
          type="button"
          onClick={() => setTab("sugerencias")}
          className={`relative flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${tab === "sugerencias" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Sugerencias
          {suggestions.length > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#16A34A] px-1 text-[10px] font-semibold text-white">
              {suggestions.length}
            </span>
          )}
        </button>
      </div>

      {tab === "resumen" && (
        <ReportesClient
          totalSpend30d={totalSpend30d}
          byCategory={byCategory}
          byWeek={byWeek}
          topProducts={topProducts}
          urgentExpirations={urgentExpirations}
          restockCount={restockCount}
        />
      )}
      {tab === "historial" && <PurchaseHistory purchases={purchases} />}
      {tab === "sugerencias" && <SuggestionsPanel suggestions={suggestions} />}
    </div>
  );
}
