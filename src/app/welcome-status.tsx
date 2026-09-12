import Link from "next/link";
import { getActiveHousehold } from "@/lib/household";
import { Button } from "@/components/ui";

// Única parte de la pantalla de bienvenida que depende de Supabase.
// Vive separada de page.tsx a propósito, envuelta en su propio
// <Suspense> desde ahí: así el ícono/título/bajada de arriba nunca
// esperan por esto.
export async function WelcomeStatus() {
  const { user, household } = await getActiveHousehold();

  if (!user) {
    return (
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Link href="/login" className="block">
          <Button className="w-full">Iniciar sesión</Button>
        </Link>
        <Link href="/login?mode=signup" className="block">
          <Button variant="secondary" className="w-full">
            Crear cuenta
          </Button>
        </Link>
      </div>
    );
  }

  if (!household) {
    return (
      <div className="flex w-full max-w-xs flex-col gap-2">
        <p className="text-xs text-zinc-500">
          Ya iniciaste sesión. Falta terminar de armar tu hogar.
        </p>
        <Link href="/onboarding" className="block">
          <Button className="w-full">Continuar</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <p className="text-xs text-zinc-500">
        ¡Hola de nuevo! Seguís en <strong>{household.name}</strong>.
      </p>
      <Link href="/lista" className="block">
        <Button className="w-full">Entrar a mi lista</Button>
      </Link>
    </div>
  );
}

// Mismo tamaño/forma que el contenido real (dos botones de ancho
// completo) para que no haya salto de layout cuando <WelcomeStatus>
// reemplaza esto.
export function WelcomeStatusSkeleton() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2" aria-hidden>
      <div className="h-11 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-11 w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
