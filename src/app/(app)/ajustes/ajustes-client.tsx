"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import { importSeedCatalog } from "./import-seed-action";

export function AjustesClient({
  household,
  userEmail,
  memberCount,
}: {
  household: { id: string; name: string; invite_code: string | null };
  userEmail: string;
  memberCount: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [importing, startImport] = useTransition();
  const [importMessage, setImportMessage] = useState<string | null>(null);

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
