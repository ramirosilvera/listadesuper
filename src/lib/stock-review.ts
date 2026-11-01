// Tipos y helpers del repaso de stock (Fase 40). Viven fuera de
// repaso-tab.tsx a propósito: ese archivo es "use client" y la página de
// Stock (servidor) necesita llamar a toReviewItems().

export type ReviewItem = {
  product_id: string;
  name: string;
  unit_label: string;
  quantity_on_hand: number;
  restock_cycle_days: number | null;
  days_since_confirmed: number | null;
};

export const REVIEW_BATCH = 15;

export const REVIEW_COLUMNS =
  "product_id, name, unit_label, quantity_on_hand, restock_cycle_days, days_since_confirmed";

type ReviewRow = {
  product_id: string | null;
  name: string | null;
  unit_label: string | null;
  quantity_on_hand: number | null;
  restock_cycle_days: number | null;
  days_since_confirmed: number | null;
};

export function toReviewItems(rows: ReviewRow[] | null): ReviewItem[] {
  return (rows ?? [])
    .filter((r) => r.product_id && r.name)
    .map((r) => ({
      product_id: r.product_id as string,
      name: r.name as string,
      unit_label: r.unit_label ?? "",
      quantity_on_hand: Number(r.quantity_on_hand ?? 0),
      restock_cycle_days: r.restock_cycle_days,
      days_since_confirmed: r.days_since_confirmed,
    }));
}

// Orden del repaso (Fase 43): primero lo que se compró de verdad (su cantidad
// parte de una compra real) y, dentro de eso, lo que lleva más días de atraso
// sobre su ciclo. Lo que solo tiene la carga inicial va al final: antes se
// ordenaba por veces-vencido (días / ciclo) y encabezaban los nunca comprados
// con ciclo corto.
export const REVIEW_ORDER = [
  { column: "has_purchase", ascending: false },
  { column: "days_overdue", ascending: false },
] as const;
