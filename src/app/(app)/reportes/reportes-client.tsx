"use client";

import { Card } from "@/components/ui";

type TopProduct = {
  product_id: string | null;
  product_name: string | null;
  purchase_count: number | null;
};

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "critical";
}) {
  return (
    <Card className="flex-1 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`font-display mt-1 text-xl font-semibold tabular-nums ${
          tone === "critical"
            ? "text-red-600 dark:text-red-400"
            : tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-zinc-900 dark:text-zinc-50"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}

export function ReportesClient({
  topProducts,
  urgentExpirations,
  restockCount,
}: {
  topProducts: TopProduct[];
  urgentExpirations: number;
  restockCount: number;
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex gap-3">
        <StatTile
          label="Vencen pronto"
          value={String(urgentExpirations)}
          tone={urgentExpirations > 0 ? "critical" : "neutral"}
        />
        <StatTile
          label="Para reponer"
          value={String(restockCount)}
          tone={restockCount > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Lo que más comprás (últimos 90 días)
        </h2>
        {topProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Todavía no hay suficientes compras.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topProducts.map((p, i) => (
              <li key={p.product_id} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-zinc-400">{i + 1}.</span>
                <span className="flex-1 text-zinc-900 dark:text-zinc-50">{p.product_name}</span>
                <span className="text-zinc-500">{p.purchase_count}x</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
