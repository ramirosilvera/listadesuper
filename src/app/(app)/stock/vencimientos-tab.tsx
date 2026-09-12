"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BANNER_DISMISS_KEY = "listasuper:vencimientos-estimado-banner-dismissed";

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
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);

  // Arranca oculto (bannerDismissed=true) para que SSR e hidratación
  // coincidan -- localStorage no existe en el server. Se corrige una sola
  // vez al montar, igual que install-prompt.tsx.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBannerDismissed(window.localStorage.getItem(BANNER_DISMISS_KEY) === "1");
    } catch {
      // Sin acceso a localStorage, mejor mostrar el banner de más que
      // arriesgarse a ocultar información que ayuda a confiar en la app.
    }
  }, []);

  function dismissBanner() {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem(BANNER_DISMISS_KEY, "1");
    } catch {
      // No es grave si no se guarda -- puede volver a aparecer.
    }
  }

  const hasEstimated = initialExpirations.some(
    (e) => e.purchase_item_id === null && !e.confirmed_by_user,
  );

  async function resolve(id: string, status: "consumed" | "discarded") {
    setErrorId(null);
    setBusyId(id);
    const { error } = await supabase.rpc("resolve_expiration", {
      p_expiration_id: id,
      p_status: status,
    });
    setBusyId(null);
    setConfirmDiscardId(null);
    if (error) {
      // Antes esto fallaba en silencio: el ítem se quedaba ahí sin
      // ningún indicio de que el toque no se había guardado.
      setErrorId(id);
      return;
    }
    setExpirations((prev) => prev.filter((e) => e.id !== id));
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
    // Al corregir la fecha a mano, el dato deja de ser una estimación de
    // arranque (ver seed_initial_stock, Fase 6) y pasa a ser lo que la
    // familia realmente sabe -- por eso confirmed_by_user se marca acá,
    // no solo cuando la fecha viene de una compra real (purchase_item_id).
    // Sin esto, la etiqueta "aprox." quedaría pegada para siempre incluso
    // después de que alguien la corrija a mano.
    const { error } = await supabase
      .from("product_expirations")
      .update({ expiration_date: dateDraft, confirmed_by_user: true })
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
              ? {
                  ...e,
                  expiration_date: dateDraft,
                  days_until: daysUntil,
                  level,
                  confirmed_by_user: true,
                }
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
    <div className="flex flex-col gap-3">
      {hasEstimated && !bannerDismissed && (
        <div className="flex items-start gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <span className="flex-1">
            Estas fechas arrancaron como un cálculo a partir de tu historial,
            no todas vienen de una compra confirmada. Las marcadas{" "}
            <span className="font-medium">aprox.</span> se ajustan solas en
            cuanto las toques.
          </span>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Cerrar aviso"
            className="shrink-0 select-none touch-manipulation rounded-full px-1 text-zinc-400 active:text-zinc-600 dark:active:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}
      <ul className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      {expirations.map((exp) => {
        const style = LEVEL_STYLES[exp.level ?? "green"] ?? LEVEL_STYLES.green;
        const confirming = confirmDiscardId === exp.id;
        const isEstimated = exp.purchase_item_id === null && !exp.confirmed_by_user;
        return (
          <li
            key={exp.id}
            className="flex flex-col gap-1.5 border-b border-zinc-100 bg-white px-3 py-2.5 last:border-b-0 dark:border-zinc-900 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-center gap-2">
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
                      // text-base (16px), no text-sm: en iOS Safari un
                      // input mas chico hace auto-zoom al tocarlo.
                      className="h-9 rounded-lg border border-zinc-300 px-2 text-base text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
                    {isEstimated ? " · aprox." : ""}
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
                  onClick={() => setConfirmDiscardId(exp.id)}
                  className="min-h-9 select-none touch-manipulation rounded-full bg-red-50 px-3 text-xs font-medium text-red-700 active:bg-red-100 disabled:opacity-50 dark:bg-red-950 dark:text-red-400 dark:active:bg-red-900"
                >
                  Se venció, lo tiré
                </button>
              </div>
            </div>

            {errorId === exp.id && (
              <p className="text-xs text-red-600 dark:text-red-400">
                No se pudo guardar. Probá de nuevo.
              </p>
            )}

            {confirming && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                <span className="flex-1">
                  ¿Tirar &quot;{exp.product_name}&quot;? Descuenta el stock real, no se puede deshacer.
                </span>
                <button
                  type="button"
                  disabled={busyId === exp.id}
                  onClick={() => resolve(exp.id, "discarded")}
                  className="min-h-8 select-none touch-manipulation rounded-full bg-red-600 px-3 text-xs font-medium text-white active:bg-red-700 disabled:opacity-50"
                >
                  {busyId === exp.id ? "Un momento…" : "Sí, lo tiré"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDiscardId(null)}
                  className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-red-700 dark:text-red-300"
                >
                  Cancelar
                </button>
              </div>
            )}
          </li>
        );
      })}
      </ul>
    </div>
  );
}
