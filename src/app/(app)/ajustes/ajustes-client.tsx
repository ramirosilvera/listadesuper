"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import { importSeedCatalog } from "./import-seed-action";

type ArchivedProduct = { id: string; name: string };

export function AjustesClient({
  household,
  userEmail,
  memberCount,
  archivedProducts: initialArchivedProducts,
}: {
  household: { id: string; name: string; invite_code: string | null };
  userEmail: string;
  memberCount: number;
  archivedProducts: ArchivedProduct[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [importing, startImport] = useTransition();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [seeding, startSeed] = useTransition();
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [archivedProducts, setArchivedProducts] = useState(initialArchivedProducts);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function copyCode() {
    if (!household.invite_code) return;
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard puede no estar disponible (ej. sin HTTPS); no es crítico.
    }
  }

  function seedInitialStock() {
    startSeed(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("seed_initial_stock", {
        p_household_id: household.id,
      });
      if (error) {
        setSeedMessage(error.message);
        return;
      }
      const result = data as { stock_seeded: number; expirations_seeded: number };
      setSeedMessage(
        result.stock_seeded === 0
          ? "No había productos nuevos para cargar: ya tenían stock."
          : `Listo: se cargó 1 unidad de stock a ${result.stock_seeded} producto${result.stock_seeded === 1 ? "" : "s"} (con vencimiento estimado en ${result.expirations_seeded}), como si se hubieran comprado hoy. Podés ajustar cantidades y fechas desde Stock.`,
      );
      router.refresh();
    });
  }

  async function restoreProduct(product: ArchivedProduct) {
    setRestoringId(product.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("products")
      .update({ archived: false })
      .eq("id", product.id);
    setRestoringId(null);
    if (!error) {
      setArchivedProducts((prev) => prev.filter((p) => p.id !== product.id));
      router.refresh();
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Card>
        <p className="text-sm text-zinc-500">Hogar</p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {household.name}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {memberCount} {memberCount === 1 ? "integrante" : "integrantes"}
        </p>
      </Card>

      <Card>
        <p className="text-sm text-zinc-500">Código de invitación</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-center text-lg font-semibold tracking-widest dark:bg-zinc-900">
            {household.invite_code ?? "—"}
          </code>
          <Button variant="secondary" onClick={copyCode}>
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Compartiselo a quien quieras sumar al hogar — lo usa desde
          &quot;Unirme con código&quot; al entrar por primera vez.
        </p>
      </Card>

      <Card>
        <p className="text-sm text-zinc-500">Catálogo inicial</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Importa de una el catálogo normalizado del histórico de Google
          Keep ({" "}
          <code className="text-xs">data/seed/productos_historico.csv</code>
          ) como punto de partida. Los productos que ya existan (mismo
          nombre) no se duplican, así que se puede correr más de una vez
          sin problema.
        </p>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={importing}
          onClick={() =>
            startImport(async () => {
              const result = await importSeedCatalog();
              setImportMessage(result.message);
              router.refresh();
            })
          }
        >
          {importing ? "Importando…" : "Importar catálogo inicial"}
        </Button>
        {importMessage && (
          <p className="mt-2 text-sm text-[#16A34A]">{importMessage}</p>
        )}
      </Card>

      <Card>
        <p className="text-sm text-zinc-500">Stock inicial</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Carga 1 unidad de stock para cada producto del catálogo que todavía
          no tenga movimientos, y estima su próximo vencimiento a partir de
          hoy (para los que tienen vida útil conocida) — como si hubieras
          comprado todo hoy. Después podés ajustar cantidades desde{" "}
          <span className="font-medium">Stock</span> y fechas desde{" "}
          <span className="font-medium">Vencimientos</span>. Se puede correr
          más de una vez: solo completa lo que falte.
        </p>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={seeding}
          onClick={seedInitialStock}
        >
          {seeding ? "Cargando…" : "Cargar stock inicial"}
        </Button>
        {seedMessage && (
          <p className="mt-2 text-sm text-[#16A34A]">{seedMessage}</p>
        )}
      </Card>

      {archivedProducts.length > 0 && (
        <Card>
          <p className="text-sm text-zinc-500">
            Productos archivados ({archivedProducts.length})
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Ya no aparecen en Stock, sugeridos para reponer ni Vencimientos.
            Se pueden reactivar en cualquier momento.
          </p>
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
            {archivedProducts.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {p.name}
                </span>
                <button
                  type="button"
                  disabled={restoringId === p.id}
                  onClick={() => restoreProduct(p)}
                  className="min-h-9 select-none touch-manipulation rounded-full bg-zinc-100 px-3 text-xs font-medium text-zinc-700 active:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:active:bg-zinc-700"
                >
                  {restoringId === p.id ? "Restaurando…" : "Reactivar"}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <p className="text-sm text-zinc-500">Sesión iniciada como</p>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {userEmail}
        </p>
        <Button variant="secondary" className="mt-3 w-full" onClick={logout}>
          Cerrar sesión
        </Button>
      </Card>
    </div>
  );
}
