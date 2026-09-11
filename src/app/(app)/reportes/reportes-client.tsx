"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui";

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

// Paleta categorica de referencia (dataviz skill / references/palette.md):
// orden fijo, ya validada (CVD Delta E >= 8, normal-vision >= 15 en pares
// adyacentes). No se cicla ni se reordena por producto.
const CATEGORICAL = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

const WEEKDAY_FMT = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" });

function money(n: number) {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

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
        className={`mt-1 text-xl font-semibold tabular-nums ${
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
  totalSpend30d,
  byCategory,
  byWeek,
  topProducts,
  urgentExpirations,
  restockCount,
}: {
  totalSpend30d: number;
  byCategory: CategorySpend[];
  byWeek: WeekSpend[];
  topProducts: TopProduct[];
  urgentExpirations: number;
  restockCount: number;
}) {
  const categoryData = byCategory
    .map((c, i) => ({
      name: c.category_name ?? "Sin categoría",
      total: c.total_amount ?? 0,
      color: CATEGORICAL[i % CATEGORICAL.length],
    }))
    .sort((a, b) => b.total - a.total);

  const weekData = byWeek.map((w) => ({
    label: w.week_start ? WEEKDAY_FMT.format(new Date(w.week_start)) : "",
    total: w.total_amount ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex gap-3">
        <StatTile label="Gasto (30 días)" value={money(totalSpend30d)} />
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
          Gasto por categoría (últimos 30 días)
        </h2>
        {categoryData.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Todavía no hay compras registradas en los últimos 30 días.
          </p>
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                barCategoryGap={10}
              >
                <CartesianGrid horizontal={false} stroke="#e1e0d9" className="dark:opacity-20" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#898781" }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(137,135,129,0.1)" }}
                  formatter={(value) => [money(Number(value) || 0), "Gasto"]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e1e0d9",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {categoryData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Evolución de gasto (últimas semanas)
        </h2>
        {weekData.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Todavía no hay historial suficiente.
          </p>
        ) : (
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid vertical={false} stroke="#e1e0d9" className="dark:opacity-20" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(value) => [money(Number(value) || 0), "Gasto"]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e1e0d9",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#16A34A"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#16A34A" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

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
