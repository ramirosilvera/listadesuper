// Service worker mínimo, con un único propósito: satisfacer el criterio
// real que usa Chrome para decidir si dispara `beforeinstallprompt` (ver
// docs/plan.md — Fase 13). Confirmado con búsqueda web actual: aunque
// Chrome ya no exige un service worker para que la PWA sea "instalable"
// desde el menú, el algoritmo que decide si MUESTRA el prompt de
// instalación todavía requiere uno con un fetch handler real -- y no
// puede ser un simple placeholder vacío ("noop"), así que además de
// existir tiene que hacer algo genuino.
//
// A propósito NO se cachea nada dinámico (HTML de páginas, llamadas a
// Supabase): esta app siempre muestra datos personales/del hogar
// renderizados en el servidor por request (auth, stock, listas), y
// servir una versión vieja desde caché podría mostrarle a alguien datos
// de otro momento sin que se dé cuenta. Lo único que cachea son los
// activos verdaderamente estáticos (íconos, manifest) donde no hay ese
// riesgo -- cache-first con passthrough a la red si no está.
const CACHE_NAME = "listasuper-static-v1";
const STATIC_PATHS = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PATHS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET, mismo origen: cualquier otra cosa (RPCs a Supabase, POSTs,
  // llamadas cross-origin) sigue exactamente igual que sin service
  // worker -- no se llama a respondWith(), el browser la maneja nativa.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const path = new URL(request.url).pathname;
  if (!STATIC_PATHS.includes(path)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request)),
  );
});
