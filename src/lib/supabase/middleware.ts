import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión de Supabase Auth en cada request (server components no
// pueden escribir cookies, así que este paso vive en el middleware).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No borrar: refresca el token si venció y deja las cookies al día.
  // getClaims() (Fase 39) verifica la firma del JWT localmente en vez de
  // pegarle al servidor de Auth en cada request -- y este proxy corre en
  // TODAS las navegaciones y prefetches, así que era la ida y vuelta de red
  // más repetida de la app.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
