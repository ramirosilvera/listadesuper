import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { Button, Card } from "@/components/ui";

// Título/descripción propios para que el link se vea bien en la vista
// previa de WhatsApp (si no, hereda el título genérico del layout raíz).
// noindex porque es un link de invitación — no tiene sentido que motores
// de búsqueda lo indexen.
export const metadata: Metadata = {
  title: "Te invitaron a un hogar en ListaSuper",
  description: "Abrí este link para unirte a la lista de súper compartida.",
  robots: { index: false, follow: false },
};

// Deep link de invitación: /join/<codigo>, pensado para compartirse por
// WhatsApp. Sin sesión, manda a crear cuenta/entrar y de vuelta acá
// (?next=/join/<codigo>) para que la unión al hogar termine sola, sin
// que nadie tenga que copiar y pegar el código a mano.
function JoinScreen({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center bg-zinc-50 py-[max(4rem,env(safe-area-inset-top))] text-center dark:bg-black"
      style={{
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
      <Card className="w-full max-w-sm">{children}</Card>
    </div>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { user, household } = await getActiveHousehold();

  if (!user) {
    redirect(
      `/login?mode=signup&next=${encodeURIComponent(`/join/${code}`)}`,
    );
  }

  if (household) {
    return (
      <JoinScreen>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Ya formás parte del hogar <strong>{household.name}</strong>. Por
          ahora no se puede pertenecer a más de un hogar a la vez.
        </p>
        <Link href="/lista" className="mt-4 block">
          <Button className="w-full">Ir a mi lista</Button>
        </Link>
      </JoinScreen>
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_household_by_code", {
    p_invite_code: code,
  });

  if (error) {
    return (
      <JoinScreen>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Ese link de invitación ya no es válido. Pedile a quien te invitó
          que te comparta el código de nuevo desde Ajustes.
        </p>
        <Link href="/onboarding" className="mt-4 block">
          <Button variant="secondary" className="w-full">
            Crear mi propio hogar
          </Button>
        </Link>
      </JoinScreen>
    );
  }

  redirect("/lista");
}
