// Tipos y helpers del repaso de stock (Fase 38). Viven fuera de
// repaso-tab.tsx a propósito: ese archivo es "use client" y la página de
// Stock (servidor) necesita llamar a toReviewItems().

export type ReviewItem = {
  product_id: string;
  name: string;
  unit_label: string;
  quantity_on_hand: number;
  effective_cycle_days: number | null;
  cycle_source: string | null;
  days_since_confirmed: number | null;
};

export const REVIEW_BATCH = 15;

export const REVIEW_COLUMNS =
  "product_id, name, unit_label, quantity_on_hand, effective_cycle_days, cycle_source, days_since_confirmed";

type ReviewRow = {
  product_id: string | null;
  name: string | null;
  unit_label: string | null;
  quantity_on_hand: number | null;
  effective_cycle_days: number | null;
  cycle_source: string | null;
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
      effective_cycle_days: r.effective_cycle_days,
      cycle_source: r.cycle_source,
      days_since_confirmed: r.days_since_confirmed,
    }));
}
