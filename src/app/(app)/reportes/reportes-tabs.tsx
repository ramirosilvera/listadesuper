"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
  unreadSuggestions,
}: {
  householdId: string;
  householdName: string;
  members: Member[];
  topProducts: TopProduct[];
  urgentExpirations: number;
  restockCount: number;
  purchases: Purchase[];
  suggestions: ProductSuggestion[];
  unreadSuggestions: number;
}) {
  const [tab, setTab] = useState<"resumen" | "historial" | "sugerencias">("resumen");
  const [unread, setUnread] = useState(unreadSuggestions);
  const supabase = useMemo(() => createClient(), []);

  // Fase 34: abrir la pestaña marca todo lo visible como leído para esta
  // persona -- mismo criterio que "abriste la bandeja". No hace falta
  // esperar la confirmación del server para bajar el badge: si falla, la
  // próxima carga de la página lo vuelve a mostrar.
  function handleTabChange(next: "resumen" | "historial" | "sugerencias") {
    setTab(next);
    if (next === "sugerencias" && unread > 0) {
      setUnread(0);
      supabase.rpc("mark_suggestions_seen", { p_household_id: householdId });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        value={tab}
        onChange={handleTabChange}
        options={[
          { value: "resumen", label: "Resumen" },
          { value: "historial", label: "Historial" },
          {
            value: "sugerencias",
            label: "Sugerencias",
            badge: unread > 0 ? <Badge variant="brand">{unread}</Badge> : undefined,
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
