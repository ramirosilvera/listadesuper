import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ListaSuper",
    short_name: "ListaSuper",
    description:
      "Lista de compras, stock y vencimientos para el hogar",
    // "/lista" y no "/" a propósito (Fase 14): "/" solo existe para
    // decidir a dónde mandar según sesión/hogar y redirige enseguida —
    // para quien abre la app instalada ya logueado (el caso normal, todos
    // los días) eso es un viaje de ida y vuelta completo de más antes de
    // ver cualquier contenido. Entrando directo a "/lista", si hace falta
    // login/onboarding igual redirige desde ahí, sin ese paso extra.
    start_url: "/lista",
    // Explícito para no depender de que cada navegador infiera el scope
    // a partir de start_url — con un start_url sin barra final ni
    // extensión de archivo (como "/lista") esa inferencia es ambigua
    // entre navegadores; sin esto, Stock/Comprar/Reportes podrían quedar
    // fuera del scope de la app instalada y abrirse en el navegador en
    // vez de en la app standalone.
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#16A34A",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
