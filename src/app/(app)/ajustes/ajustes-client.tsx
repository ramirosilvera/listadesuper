"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";

type ArchivedProduct = { id: string; name: string; hasRealPurchases: boolean };

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
  const [archivedProducts, setArchivedProducts] = useState(initialArchivedProducts);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  function shareViaWhatsApp() {
    if (!household.invite_code) return;
    // /join/<codigo> hace todo solo del otro lado: si quien recibe el link
    // no tiene cuenta lo manda derecho a crear una, y despues de loguearse
    // (con cuenta nueva o existente) lo une al hogar sin que tenga que
    // copiar ni pegar el código en ningún lado.
    const link = `${window.location.origin}/join/${household.invite_code}`;
    const text = `Unite a nuestra lista de súper compartida "${household.name}" en ListaSuper: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
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

  // Borrado real (no soft-delete): la RLS de "products" ya rechaza esto
  // si el producto no está archivado o si tiene compras reales
  // (purchase_items) -- acá solo se ofrece el botón cuando
  // hasRealPurchases es false, así que en el uso normal esto no debería
  // chocar con la policy, pero igual se chequea la respuesta por si dos
  // pestañas del hogar hacen algo a la vez.
  async function deleteProduct(product: ArchivedProduct) {
    setDeletingId(product.id);
    setDeleteError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id)
      .select("id");
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (error || !data || data.length === 0) {
      setDeleteError(
        `No se pudo eliminar "${product.name}". Puede que ya no esté archivado o que tenga alguna compra registrada.`,
      );
      return;
    }
    setArchivedProducts((prev) => prev.filter((p) => p.id !== product.id));
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
        <p className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {household.name}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {memberCount} {memberCount === 1 ? "integrante" : "integrantes"}
        </p>
      </Card>

      <Card>
        <p className="text-sm text-zinc-500">Invitar a alguien al hogar</p>
        <Button
          className="mt-2 w-full gap-2"
          disabled={!household.invite_code}
          onClick={shareViaWhatsApp}
        >
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
            <path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.9-2-.2-.6-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z" />
            <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
          </svg>
          Compartir por WhatsApp
        </Button>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-center text-sm font-semibold tracking-widest dark:bg-zinc-900">
            {household.invite_code ?? "—"}
          </code>
          <Button variant="secondary" onClick={copyCode}>
            {copied ? "Copiado" : "Copiar código"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Quien abra el link se crea la cuenta (o entra, si ya tiene) y
          queda unido al hogar solo — no hace falta que copie ni pegue
          ningún código. El código de arriba es por si preferís
          compartirlo de otra forma; se pega desde &quot;Unirme con
          código&quot; al entrar por primera vez.
        </p>
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
              <li key={p.id} className="flex flex-col gap-1.5 py-2">
                <div className="flex items-center gap-2">
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
                  {!p.hasRealPurchases && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDeleteId(p.id);
                      }}
                      className="min-h-9 select-none touch-manipulation rounded-full px-3 text-xs font-medium text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-950"
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                {p.hasRealPurchases && (
                  <p className="text-xs text-zinc-400">
                    Tiene compras reales registradas — se mantiene archivado
                    para no perder ese gasto en Reportes.
                  </p>
                )}

                {confirmDeleteId === p.id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                    <span className="flex-1">
                      ¿Eliminar &quot;{p.name}&quot; definitivamente? A diferencia de
                      archivar, esto no se puede deshacer.
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={deletingId === p.id}
                      onClick={() => deleteProduct(p)}
                    >
                      {deletingId === p.id ? "Eliminando…" : "Sí, eliminar"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-red-700 dark:text-red-300"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {deleteError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deleteError}</p>
          )}
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
