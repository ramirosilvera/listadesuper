"use client";

import { useState } from "react";
import { Badge, SegmentedControl } from "@/components/ui";
import { StockClient } from "./stock-client";
import { RepasoTab } from "./repaso-tab";
import { REVIEW_BATCH, type ReviewItem } from "@/lib/stock-review";
import { VencimientosTab } from "./vencimientos-tab";

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
  auto_restock: boolean;
  restock_snoozed_until: string | null;
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
  purchase_item_id: string | null;
  confirmed_by_user: boolean | null;
};

export function StockTabs({
  householdId,
  products,
  categories,
  initialExpirations,
  reviewItems,
  reviewTotal,
}: {
  householdId: string;
  products: Product[];
  categories: Category[];
  initialExpirations: Expiration[];
  reviewItems: ReviewItem[];
  reviewTotal: number;
}) {
  const [tab, setTab] = useState<"stock" | "repaso" | "vencimientos">("stock");
  // Fase 40: el repaso corrige cantidades; la pestaña Stock se vuelve a
  // montar al volver (render condicional) y lee de acá, así ve el número
  // confirmado en vez del que vino del servidor al cargar la página.
  const [liveProducts, setLiveProducts] = useState(products);
  const [pendingReview, setPendingReview] = useState(reviewTotal);
  // El número de esta solapa mostraba el total (hoy, 106 en el hogar
  // real -- casi todos vencimientos estimados a meses o años, ver Fase
  // "filtros en Vencimientos"). Mostrar ese número grande antes incluso
  // de entrar a la pestaña ya contribuía a la sensación de lista
  // abrumadora que reportó el usuario -- se cambia a contar solo lo que
  // vence pronto (expired/red/amber, <=7 días), mismo criterio que ahora
  // usa el filtro "Próximos" por defecto dentro de la pestaña. Si no hay
  // nada próximo, no se muestra número: no hay nada urgente que avisar.
  const soonCount = initialExpirations.filter(
    (e) => e.level === "expired" || e.level === "red" || e.level === "amber",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "stock", label: "Stock" },
          {
            value: "repaso",
            label: "Repaso",
            badge:
              pendingReview > 0 ? (
                // Tope visual en 15 (el tamaño de una tanda): un "24" grande
                // fue justo lo que molestó en Vencimientos.
                <Badge variant="warning" className="ml-0.5">
                  {pendingReview > REVIEW_BATCH ? `${REVIEW_BATCH}+` : pendingReview}
                </Badge>
              ) : undefined,
          },
          {
            value: "vencimientos",
            label: "Vencimientos",
            badge:
              soonCount > 0 ? (
                <Badge variant="danger" className="ml-0.5">
                  {soonCount}
                </Badge>
              ) : undefined,
          },
        ]}
      />

      {tab === "stock" ? (
        <StockClient householdId={householdId} products={liveProducts} categories={categories} />
      ) : tab === "repaso" ? (
        <RepasoTab
          householdId={householdId}
          initialItems={reviewItems}
          initialTotal={reviewTotal}
          onTotalChange={setPendingReview}
          onApplied={(productId, quantity) =>
            setLiveProducts((prev) =>
              prev.map((p) => (p.id === productId ? { ...p, quantity_on_hand: quantity } : p)),
            )
          }
        />
      ) : (
        <VencimientosTab initialExpirations={initialExpirations} />
      )}
    </div>
  );
}
