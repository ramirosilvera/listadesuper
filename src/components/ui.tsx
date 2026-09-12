import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export const cx = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ");

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cx(
        "inline-flex touch-manipulation items-center justify-center rounded-full font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" && "min-h-11 px-5 text-sm",
        size === "sm" && "min-h-8 px-3.5 text-xs",
        variant === "primary" &&
          "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700",
        variant === "secondary" &&
          "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 active:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700 dark:active:bg-zinc-700",
        variant === "ghost" &&
          "text-zinc-600 hover:bg-zinc-100 active:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:active:bg-zinc-900",
        variant === "danger" &&
          "bg-red-600 text-white hover:bg-red-700 active:bg-red-700",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "shadow-soft rounded-2xl border border-zinc-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: "brand" | "danger" | "warning" | "neutral";
}) {
  return (
    <span
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
        variant === "brand" && "bg-brand-600 text-white",
        variant === "danger" && "bg-red-500 text-white",
        variant === "warning" && "bg-amber-500 text-white",
        variant === "neutral" &&
          "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}

// Segmented control (tabs pill): reemplaza el patrón que se repetía a
// mano en Login/Onboarding, Stock/Vencimientos y Reportes. `badge` va
// inline junto a la etiqueta, no superpuesto, para no depender de
// posicionamiento absoluto frágil en distintos anchos de pantalla.
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; badge?: ReactNode }>;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx(
        "flex gap-1 rounded-full bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              "flex min-h-9 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-full px-3 py-2 transition-colors select-none",
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-400",
            )}
          >
            {opt.label}
            {opt.badge}
          </button>
        );
      })}
    </div>
  );
}

// Botón circular chico para acciones secundarias repetitivas (stepper de
// cantidad +/-). 36px, no 44px: es una acción terciaria dentro de una fila
// que ya mide 44px+ de alto y tiene mucho margen alrededor para el dedo —
// llevarlo a 44px por regla general desbalancearía filas compactas que hoy
// funcionan bien.
export function IconButton({
  className,
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex touch-manipulation items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors select-none active:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:active:bg-zinc-700",
        size === "md" && "h-9 w-9",
        size === "sm" && "h-7 w-7",
        className,
      )}
      {...props}
    />
  );
}

// Trazo del carrito de compras, ícono de marca de ListaSuper — repetido
// antes a mano (mismos 7 <path>) en header, loading, welcome, error e
// install-prompt. Un solo lugar para el trazo evita que una pantalla
// quede con el carrito "viejo" si el diseño del ícono cambia.
export function CartMark({
  className,
  strokeWidth = 1.8,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
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

// Marca completa: carrito sobre fondo verde redondeado. `className` define
// el contenedor (tamaño, radio), `iconClassName` el ícono — cada pantalla
// ya usaba proporciones ligeramente distintas (header chico, welcome
// grande) y las mantiene, pasando ambas clases explícitamente.
export function CartLogo({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-2xl bg-brand-600 text-white",
        className,
      )}
    >
      <CartMark className={iconClassName ?? "h-1/2 w-1/2"} />
    </div>
  );
}
