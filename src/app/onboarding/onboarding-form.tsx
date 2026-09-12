"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card, SegmentedControl } from "@/components/ui";

export function OnboardingForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "create") {
      const { error } = await supabase.rpc("create_household", {
        p_name: name.trim(),
      });
      if (error) {
        setLoading(false);
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.rpc("join_household_by_code", {
        p_invite_code: code.trim(),
      });
      if (error) {
        setLoading(false);
        setError(
          error.message.includes("invalido")
            ? "Ese código no corresponde a ningún hogar."
            : error.message,
        );
        return;
      }
    }

    // Sin setLoading(false) acá a propósito: el botón se mantiene en
    // "Un momento…" hasta que la navegación reemplaza esta pantalla,
    // en vez de volver a su estado normal mientras todavía se está
    // resolviendo el layout de destino.
    router.push("/lista");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <SegmentedControl
        className="mb-5"
        value={mode}
        onChange={setMode}
        options={[
          { value: "create", label: "Crear hogar" },
          { value: "join", label: "Unirme con código" },
        ]}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "create" ? (
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Nombre del hogar
            <Input
              className="mt-1"
              placeholder="Casa"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : (
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Código de invitación
            {/*
              Sin "uppercase" a propósito: el código es case-sensitive
              (generate_invite_code mezcla mayúsculas y minúsculas) y
              compara con "=" exacto -- si el CSS lo mostraba todo en
              mayúsculas mientras el valor real tecleado podía tener
              minúsculas, alguien tipeándolo a mano (no desde el link de
              WhatsApp) veía un código que no coincidía con lo que en
              realidad estaba mandando, y fallaba sin motivo aparente.
            */}
            <Input
              className="mt-1"
              placeholder="Ej: aB3xY9_k"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading
            ? "Un momento…"
            : mode === "create"
              ? "Crear hogar"
              : "Unirme"}
        </Button>
      </form>
    </Card>
  );
}
