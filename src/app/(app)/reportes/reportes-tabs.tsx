"use client";

import { useState } from "react";
import { Badge, SegmentedControl } from "@/components/ui";
import { ReportesClient } from "./reportes-client";
import { PurchaseHistory } from "./purchase-history";
import { SuggestionsPanel, type ProductSuggestion } from "./suggestions-panel";

type TopProduct = {
  product_id: string | null;
  product_name: string | null;
  purchase_count: number | null;
};

type PurchaseItem = {
  id: string;
  quantity: number;
  products: { name: string; unit_label: string } | null;
};

type Purchase = {
  id: string;
  purchased_at: string;
  created_by: string;
  stores: { name: string } | null;
  purchase_items: PurchaseItem[];
};

type Member = { id: string; display_name: string };

export function ReportesTabs({
  householdId,
  householdName,
  members,
  topProducts,
  urgentExpirations,
  restockCount,
  purchases,
  suggestions,
}: {
  householdId: string;
  householdName: string;
  members: Member[];
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
          topProducts={topProducts}
          urgentExpirations={urgentExpirations}
          restockCount={restockCount}
        />
      )}
      {tab === "historial" && (
        <PurchaseHistory
          purchases={purchases}
          householdId={householdId}
          householdName={householdName}
          members={members}
        />
      )}
      {tab === "sugerencias" && <SuggestionsPanel suggestions={suggestions} />}
    </div>
  );
}
