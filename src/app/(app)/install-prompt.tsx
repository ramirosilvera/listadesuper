"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

// Ver docs/plan.md (Fase 13). Android e iOS no tienen NADA en común acá:
// Android/Chrome expone un evento programático (`beforeinstallprompt`)
// que se puede disparar con un botón propio; iOS Safari no tiene ningún
// API equivalente (confirmado con búsqueda web -- Apple no lo implementa
// y no hay señales de que lo vaya a hacer) y la única forma de instalar
// es manual, desde Compartir → "Agregar a inicio". Por eso son dos ramas
// de UI completamente distintas, no una sola con una bandera.

const DISMISS_KEY = "listasuper:install-prompt-dismissed-until";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// localStorage puede tirar (Safari en modo privado más viejo, storage
// lleno) -- sin el try/catch, eso rompía el efecto que decide qué rama
// mostrar (o el handler de "Ahora no"), no solo el guardado del dismiss.
// El peor caso sin protección es un banner no crítico; con protección,
// en el peor caso simplemente vuelve a aparecer la próxima vez.
function isDismissedForNow(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw != null && Number(raw) > Date.now();
  } catch {
    return false;
  }
}

function dismissForNow() {
  try {
    window.localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
    );
  } catch {
    // No pasa nada si no se pudo guardar -- el banner puede volver a
    // aparecer antes de lo esperado, no es grave.
  }
}

// Heurística de "estamos dentro del navegador embebido de otra app"
// (Instagram, Facebook, Line, o un WebView de Android genérico) --
// ninguna de las dos rutas de instalación funciona ahí. Declarado como
// SUPUESTO, no hecho verificado: no hay una forma 100% confiable de
// detectar esto por user agent, y el navegador embebido de WhatsApp en
// iOS en particular no tiene un token propio conocido -- ese caso puede
// no detectarse y mostrar igual las instrucciones de iOS (que ahí no
// van a funcionar). Cubre los casos más comunes, no todos.
function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(ua);
}

export function InstallPrompt() {
  const [mode, setMode] = useState<"none" | "android" | "ios" | "blocked">("none");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Registrar el service worker es un prerrequisito real, no cosmético:
    // sin uno con un fetch handler, Chrome no muestra beforeinstallprompt
    // aunque el manifest esté perfecto (ver sw.js para el detalle y las
    // fuentes). Si falla (navegador viejo, modo privado estricto), el
    // resto de la app sigue funcionando igual -- no es un error fatal.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || isDismissedForNow()) return;

    const ua = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    // Sin esto no hay ningún valor correcto de `mode` que el server pueda
    // renderizar (depende de navigator/window, que no existen en SSR) --
    // arranca en "none" siempre y este efecto lo corrige una sola vez
    // apenas monta en el cliente. Es la excepción legítima a la regla, no
    // un cálculo derivable de props/estado que debería vivir en el render.
    if (isInAppBrowser(ua)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("blocked");
      return;
    }

    if (isIOS) {
      setMode("ios");
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setMode("android");
    }

    function onAppInstalled() {
      setDeferredPrompt(null);
      setMode("none");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setInstalling(false);
    setDeferredPrompt(null);
    if (choice.outcome !== "accepted") dismissForNow();
    setMode("none");
  }

  function handleDismiss() {
    dismissForNow();
    setMode("none");
  }

  if (mode === "none") return null;

  return (
    <Card className="mb-4 flex items-start gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#16A34A] text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="m15 11-1 9" />
          <path d="m19 11-4-7" />
          <path d="M2 11h20" />
          <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" />
          <path d="M4.5 15.5h15" />
          <path d="m5 11 4-7" />
          <path d="m9 11 1 9" />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        {mode === "android" && (
          <>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Agregá ListaSuper a tu pantalla de inicio
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Acceso directo, sin abrir el navegador cada vez.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                className="min-h-8 select-none touch-manipulation rounded-full bg-[#16A34A] px-3 text-xs font-medium text-white active:bg-[#15803D] disabled:opacity-50"
              >
                {installing ? "Un momento…" : "Agregar"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="min-h-8 select-none touch-manipulation rounded-full px-2 text-xs text-zinc-500"
              >
                Ahora no
              </button>
            </div>
          </>
        )}

        {mode === "ios" && (
          <>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Agregá ListaSuper a tu pantalla de inicio
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Tocá compartir{" "}
              <span aria-hidden className="inline-block">
                ⬆️
              </span>{" "}
              abajo y elegí &quot;Agregar a inicio&quot;.
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              className="mt-2 min-h-8 select-none touch-manipulation rounded-full px-0 text-xs text-zinc-500 underline decoration-dotted"
            >
              Ahora no
            </button>
          </>
        )}

        {mode === "blocked" && (
          <>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Agregá ListaSuper a tu pantalla de inicio
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Desde acá no se puede. Abrí este link en Safari o Chrome
              (buscá &quot;Abrir en el navegador&quot;) para poder
              agregarlo.
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              className="mt-2 min-h-8 select-none touch-manipulation rounded-full px-0 text-xs text-zinc-500 underline decoration-dotted"
            >
              Ahora no
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
