"use client";

import { useState } from "react";
import { Badge, SegmentedControl } from "@/components/ui";
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
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "resumen", label: "Resumen" },
          { value: "historial", label: "Historial" },
          {
            value: "sugerencias",
            label: "Sugerencias",
            badge:
              suggestions.length > 0 ? (
                <Badge variant="brand">{suggestions.length}</Badge>
              ) : undefined,
          },
        ]}
      />

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
