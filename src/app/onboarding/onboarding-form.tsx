"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card } from "@/components/ui";

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
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.rpc("join_household_by_code", {
        p_invite_code: code.trim(),
      });
      setLoading(false);
      if (error) {
        setError(
          error.message.includes("invalido")
            ? "Ese código no corresponde a ningún hogar."
            : error.message,
        );
        return;
      }
    }

    router.push("/lista");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <div className="mb-5 flex gap-1 rounded-full bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${mode === "create" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Crear hogar
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`flex-1 select-none touch-manipulation rounded-full py-2 transition-colors ${mode === "join" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500"}`}
        >
          Unirme con código
        </button>
      </div>

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
            <Input
              className="mt-1 uppercase"
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
