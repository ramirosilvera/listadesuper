"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Llegar acá desde un link de invitación (/join/[codigo]) manda a la
  // gente derecho a "Crear cuenta" y, una vez logueados, de vuelta a esa
  // misma ruta para que termine de unirlos al hogar sin pegar ningún
  // código a mano.
  const next = searchParams.get("next");
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setLoading(false);
        setError(
          error.message === "Invalid login credentials"
            ? "Email o contraseña incorrectos."
            : error.message,
        );
        return;
      }
      // No hacemos setLoading(false) acá a propósito: la redirección todavía
      // tiene que resolver sesión + hogar antes de pintar algo (ver
      // (app)/layout.tsx), así que el botón se queda en "Un momento…" hasta
      // que la navegación reemplaza esta pantalla — evita que parpadee a su
      // estado normal y el usuario piense que el tap no hizo nada.
      router.push(next || "/");
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    if (data.session) {
      // Confirmación por email deshabilitada: signUp ya deja al usuario logueado.
      router.push(next || "/");
      router.refresh();
      return;
    }

    setLoading(false);
    setInfo(
      "Listo. Revisá tu correo para confirmar la cuenta antes de entrar.",
    );
  }

  return (
    <Card className="mt-8 w-full max-w-sm">
      <div className="mb-5 flex gap-1 rounded-full bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${mode === "login" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${mode === "signup" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Crear cuenta
        </button>
      </div>

      {next && (
        <p className="mb-3 rounded-lg bg-[#16A34A]/10 px-3 py-2 text-xs text-[#15803D] dark:text-[#4ADE80]">
          {mode === "signup" ? "Creá tu cuenta para" : "Iniciá sesión para"}{" "}
          unirte al hogar que te invitó.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
          <Input
            className="mt-1"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Contraseña
          <Input
            className="mt-1"
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {info && (
          <p className="text-sm text-[#16A34A]">{info}</p>
        )}

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading
            ? "Un momento…"
            : mode === "login"
              ? "Entrar"
              : "Crear cuenta"}
        </Button>
      </form>
    </Card>
  );
}
