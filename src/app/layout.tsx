import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ListaSuper",
  description:
    "La lista de súper que se acuerda de lo que se te vence y de lo que se te está por acabar.",
  // "Agregar a inicio" en iOS ignora el manifest.json (a diferencia de
  // Android/Chrome) y necesita estos meta tags propios de Apple para
  // abrir en modo standalone (sin la barra de Safari) con un título
  // correcto. Next los renderiza a partir de este campo.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ListaSuper",
  },
  // Evita que iOS convierta automáticamente números sueltos (precios,
  // cantidades) en links de "llamar" con subrayado azul.
  formatDetection: {
    telephone: false,
  },
  other: {
    // Next solo emite el "mobile-web-app-capable" moderno a partir de
    // appleWebApp.capable; Safari en versiones de iOS más viejas todavía
    // necesita el meta tag con prefijo "apple-" para abrir en standalone.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#16A34A",
  // Sin esto, env(safe-area-inset-*) vale 0 siempre en iOS y el contenido
  // termina por debajo del notch/home indicator en modo standalone.
  // No se fija maximum-scale/user-scalable=no a propósito: bloquear el
  // pinch-to-zoom es un problema de accesibilidad (WCAG 1.4.4), no algo
  // que valga la pena para "sentirse nativo".
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans overscroll-y-none">
        {children}
      </body>
    </html>
  );
}
