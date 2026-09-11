"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Expiration = {
  id: string;
  product_name: string | null;
  unit_label: string | null;
  expiration_date: string | null;
  quantity: number | null;
  days_until: number | null;
  level: string | null;
};

const LEVEL_STYLES: Record<
  string,
  { dot: string; badge: string; label: (days: number | null) => string }
> = {
  expired: {
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    label: (days) =>
      days === null ? "Vencido" : `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`,
  },
  red: {
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    label: (days) => (days === 0 ? "Vence hoy" : `Vence en ${days} día${days === 1 ? "" : "s"}`),
  },
  amber: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    label: (days) => `Vence en ${days} días`,
  },
  green: {
    dot: "bg-[#16A34A]",
    badge: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
    label: (days) => `Vence en ${days} días`,
  },
};

export function VencimientosTab({
  initialExpirations,
}: {
  initialExpirations: Expiration[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [expirations, setExpirations] = useState(initialExpirations);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState("");

  async function resolve(id: string, status: "consumed" | "discarded") {
    setBusyId(id);
    const { error } = await supabase.rpc("resolve_expiration", {
      p_expiration_id: id,
      p_status: status,
    });
    setBusyId(null);
    if (!error) {
      setExpirations((prev) => prev.filter((e) => e.id !== id));
    }
  }

  function startEditingDate(exp: Expiration) {
    setEditingId(exp.id);
    setDateDraft(exp.expiration_date ?? "");
  }

  async function saveDate(id: string) {
    if (!dateDraft) {
      setEditingId(null);
      return;
    }
    setEditingId(null);
    const { error } = await supabase
      .from("product_expirations")
      .update({ expiration_date: dateDraft })
      .eq("id", id);
    if (!error) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dateDraft + "T00:00:00");
      const daysUntil = Math.round((target.getTime() - today.getTime()) / 86400000);
      const level =
        daysUntil < 0 ? "expired" : daysUntil <= 2 ? "red" : daysUntil <= 7 ? "amber" : "green";
      setExpirations((prev) =>
        prev
          .map((e) =>
            e.id === id
              ? { ...e, expiration_date: dateDraft, days_until: daysUntil, level }
              : e,
          )
          .sort((a, b) => (a.expiration_date ?? "").localeCompare(b.expiration_date ?? "")),
      );
    }
  }

  if (expirations.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">
        No hay nada por vencer. A medida que registrés compras con fecha de
        vencimiento (o productos con vida útil conocida), van a aparecer acá.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      {expirations.map((exp) => {
        const style = LEVEL_STYLES[exp.level ?? "green"] ?? LEVEL_STYLES.green;
        return (
          <li
            key={exp.id}
            className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-white px-3 py-2.5 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
            <div className="min-w-[8rem] flex-1">
              <p className="text-sm text-zinc-900 dark:text-zinc-50">
                {exp.product_name ?? "Producto"}
                {exp.quantity && exp.quantity !== 1 ? ` · ${exp.quantity} ${exp.unit_label ?? ""}` : ""}
              </p>
              {editingId === exp.id ? (
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="date"
                    autoFocus
                    value={dateDraft}
                    onChange={(e) => setDateDraft(e.target.value)}
                    onBlur={() => saveDate(exp.id)}
                    className="h-8 rounded-lg border border-zinc-300 px-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    aria-label={`Fecha de vencimiento de ${exp.product_name}`}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEditingDate(exp)}
                  className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium underline decoration-dotted ${style.badge}`}
                >
                  {style.label(exp.days_until)}
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busyId === exp.id}
                onClick={() => resolve(exp.id, "consumed")}
                className="min-h-9 select-none touch-manipulation rounded-full bg-zinc-100 px-3 text-xs font-medium text-zinc-700 active:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:active:bg-zinc-700"
              >
                Ya lo usé
              </button>
              <button
                type="button"
                disabled={busyId === exp.id}
                onClick={() => resolve(exp.id, "discarded")}
                className="min-h-9 select-none touch-manipulation rounded-full bg-red-50 px-3 text-xs font-medium text-red-700 active:bg-red-100 disabled:opacity-50 dark:bg-red-950 dark:text-red-400 dark:active:bg-red-900"
              >
                Se venció, lo tiré
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
