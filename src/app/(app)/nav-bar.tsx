"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/lista", label: "Lista", icon: ListIcon },
  { href: "/stock", label: "Stock", icon: BoxIcon },
  { href: "/comprar", label: "Comprar", icon: CartIcon },
  { href: "/reportes", label: "Reportes", icon: ChartIcon },
  { href: "/ajustes", label: "Ajustes", icon: SettingsIcon },
];

// Feedback instantáneo al tocar una pestaña: `pending` pasa a true apenas
// se registra el tap (antes de que llegue cualquier respuesta del server),
// así el usuario sabe que el toque se registró aunque la pantalla todavía
// no cambió. loading.tsx de cada ruta cubre "el contenido está cargando";
// esto cubre el instante anterior, "el tap se registró".
function TabTapHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute inset-1.5 rounded-xl bg-current transition-opacity duration-150 ${
        pending ? "opacity-10" : "opacity-0"
      }`}
    />
  );
}

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/*
        Altura fija (h-16 = 4rem) a propósito, no "auto": las barras de
        acción flotantes (ver NAV_CONTENT_HEIGHT en lista/comprar) necesitan
        saber cuánto mide esto para no quedar tapadas ni flotar con un
        hueco de más arriba de este nav.
      */}
      <div className="mx-auto flex h-16 max-w-2xl select-none">
        {TABS.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium ${
                active
                  ? "text-[#16A34A]"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              <TabTapHint />
              <Icon className="h-6 w-6" active={!!active} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function iconProps(active: boolean) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.2 : 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function ListIcon({ className, active }: { className?: string; active: boolean }) {
  return (
    <svg className={className} {...iconProps(active)}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="m4 6 .5.5L6 5" />
      <path d="m4 12 .5.5L6 11" />
      <path d="m4 18 .5.5L6 17" />
    </svg>
  );
}

function BoxIcon({ className, active }: { className?: string; active: boolean }) {
  return (
    <svg className={className} {...iconProps(active)}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function CartIcon({ className, active }: { className?: string; active: boolean }) {
  return (
    <svg className={className} {...iconProps(active)}>
      <path d="m15 11-1 9" />
      <path d="m19 11-4-7" />
      <path d="M2 11h20" />
      <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" />
      <path d="M4.5 15.5h15" />
      <path d="m5 11 4-7" />
      <path d="m9 11 1 9" />
    </svg>
  );
}

function ChartIcon({ className, active }: { className?: string; active: boolean }) {
  return (
    <svg className={className} {...iconProps(active)}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 16v-4" />
      <path d="M12 16V8" />
      <path d="M17 16v-7" />
    </svg>
  );
}

function SettingsIcon({ className, active }: { className?: string; active: boolean }) {
  return (
    <svg className={className} {...iconProps(active)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
