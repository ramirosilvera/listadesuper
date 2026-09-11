# Plan de ListaSuper

Documento vivo con el plan completo del proyecto: arquitectura, modelo de datos, roadmap y las decisiones de diseño/marca. Se actualiza a medida que el Consejo revisa y el plan evoluciona.

## Objetivo y criterios de éxito

**Objetivo:** una web app (Next.js + Supabase) para un hogar compartido que reemplace la lista de Google Keep, controle stock, avise antes de que se termine algo o se venza, y muestre informes gráficos de compras/stock/vencimientos.

**Criterios de éxito:** (1) lista de compras en tiempo real entre convivientes, (2) stock que se actualiza solo al registrar una compra, (3) alertas de reposición y vencimiento confiables, (4) carga de compras rápida (manual o por foto de ticket) sin fricción en el súper, (5) dashboards claros de gasto/stock/vencimientos, (6) se siente una app prolija y con identidad propia, no una herramienta cruda.

## Decisiones confirmadas

- Hogar compartido (multi-usuario desde el día 1).
- Carga de datos: import inicial del histórico de Google Keep (ya normalizado, ver `data/seed/`) + foto de ticket (OCR) + carga manual siempre disponible.
- Stack: Next.js + Vercel + Supabase.
- Prioridad: vencimientos por fecha de caducidad.
- Identidad: nombre "ListaSuper", color de marca verde `#16A34A`, ícono canasta (ver `docs/branding-favicon.md`).

## Arquitectura técnica

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui | Buena integración con Supabase, deploy directo en Vercel, PWA fácil |
| Iconografía UI | Lucide Icons (misma familia que el favicon) | Consistencia visual, ISC license, viene por defecto con shadcn/ui |
| Backend/DB | Supabase (Postgres + Auth + Storage + Realtime + Edge Functions + Cron) | Ya es el conector disponible; cubre todo sin infra propia |
| Lista en tiempo real | Supabase Realtime | Dos personas ven la lista actualizarse en vivo |
| OCR de tickets | Edge Function con modelo de visión (Claude) → JSON estructurado | Mejor que OCR genérico + parser manual para tickets argentinos variables |
| Notificaciones | PWA + Web Push, con email como respaldo | No depende de tienda de apps |
| Jobs programados | Supabase Cron / Scheduled Edge Functions | Predicción de stock y alertas de vencimiento |

## Modelo de datos (resumen)

`households`, `household_members`, `categories`, `products` (con `default_shelf_life_days`), `stores`, `shopping_lists`, `shopping_list_items`, `purchases`, `purchase_items`, `stock_movements` (ledger, fuente de verdad del stock), `product_expirations` (FEFO), `consumption_estimates`, `units`.

RLS activado desde la primera migración, scopeado por `household_id`, función `is_household_member()` SECURITY DEFINER. Bucket de tickets privado con URLs firmadas. Invitación a hogar por link/código de un solo uso.

## Roadmap por fases

- **Fase 0 — Setup (✅ completa):** proyecto Supabase (`listadesuper`, región `sa-east-1`), scaffold Next.js 16 (App Router) + Tailwind v4, cliente de Supabase (`@supabase/ssr`) para browser/server/proxy, favicon/manifest integrados vía las convenciones de archivo de Next.js (`app/icon.svg`, `app/apple-icon.png`, `app/manifest.ts`), y migración base de RLS (`households`/`household_members`, ver `supabase/migrations/`). Auth de Supabase viene habilitado por default en el proyecto (falta cablear las pantallas de login, eso es Fase 1). Deploy en Vercel: pendiente, se hace desde el dashboard de Vercel conectando el repo (no hay conector de Vercel disponible en este entorno). `shadcn/ui`: pendiente de inicializar — `ui.shadcn.com` está bloqueado por la política de red del entorno donde se hizo el scaffold; correr `npx shadcn@latest init -d` desde una máquina sin esa restricción antes de armar las pantallas de Fase 1.
- **Fase 1 — MVP núcleo (✅ completa):** esquema completo (`categories`, `products`, `stores`, `shopping_lists`/`shopping_list_items`, `purchases`/`purchase_items`, `stock_movements` + vista `product_stock`), RPCs atómicas (`create_household`, `join_household_by_code` con código de invitación, `record_purchase`, `adjust_stock`), Realtime habilitado en `shopping_list_items`. Frontend: login/signup, alta/unión de hogar, lista de compras compartida (tiempo real), stock con ajuste rápido, flujo de registrar compra, botón de importar el catálogo inicial (`data/seed/`) desde Ajustes. Sin `shadcn/ui` (bloqueado en este entorno, ver Fase 0): componentes propios en `src/components/ui.tsx`.
- **Fase 2 — Vencimientos (✅ núcleo completo, recordatorios push/email pendientes de secret):** tabla `product_expirations` (lotes por compra, FEFO) + vista `product_expirations_upcoming` con semáforo calculado (rojo/amarillo/verde/vencido) vía RLS real. `record_purchase` extendida para aceptar fecha de vencimiento explícita por ítem, o calcularla sola desde `products.default_shelf_life_days` si no se especifica. RPC `resolve_expiration` para marcar "ya lo usé" o "se venció, lo tiré" (esto último descuenta stock real). Frontend: pestaña "Vencimientos" en Stock, con semáforo por ícono+color+texto (no solo color, por accesibilidad) y badge de cantidad urgente en la pestaña. Input opcional de fecha de vencimiento al registrar una compra.
  - **Pendiente, necesita decisión/secret:** el job nocturno + notificaciones push/email no se construyeron todavía — no tiene sentido armar un cron sin nada que dispare al final. Necesita: (a) confirmar si querés push, email, o ambos, y (b) el secret correspondiente (VAPID keys para push web, o una API key de un proveedor de mail tipo Resend). Mientras tanto, el semáforo ya es 100% funcional *mirando la app* — el usuario simplemente no recibe un aviso proactivo todavía si no la abre.
- **Fase 3 — OCR de tickets:** subida de foto, extracción con Claude vision, pantalla de revisión obligatoria antes de confirmar.
- **Fase 4 — Predicción de reposición:** consumo real (ventana móvil 90 días) + umbral manual como fallback.
- **Fase 5 — Informes gráficos:** dashboard de gasto, stock y vencimientos.
- **Fuera de alcance por ahora:** comparación de precios entre supermercados y presupuesto (el modelo de datos ya los deja preparados).

---

## Rol: UI (diseño de interfaz)

**Sistema de diseño:**
- Tailwind + shadcn/ui, tokens de color derivados de la marca (`#16A34A` como `primary`), modo claro/oscuro automático (`prefers-color-scheme`, sin selector manual en el MVP para no sumar complejidad).
- Iconografía: Lucide en toda la app (mismo lenguaje visual que el favicon).
- Tipografía: una sola familia del sistema (`ui-sans-serif` / Inter vía `next/font`) — nada de cargar múltiples fuentes que pesen en mobile.

**Pantallas clave (mobile-first, porque se usa parada en el pasillo del súper):**
1. **Lista de compras** — pantalla principal. Ítems agrupados por categoría (mismo orden que el layout físico habitual del súper, configurable), checkbox grande, cantidad editable inline, botón flotante (FAB) para agregar rápido con autocompletado contra el catálogo.
2. **Stock** — grilla o lista con semáforo de vencimiento (verde/amarillo/rojo) y de "se está por acabar".
3. **Registrar compra** — flujo de 2 pasos: sacar foto del ticket (o cargar manual), revisar/corregir, confirmar. Todo con inputs numéricos grandes, apto para usar con una sola mano.
4. **Reportes** — dashboard con tabs (Gastos / Stock / Vencimientos), gráficos simples arriba, detalle abajo.

**Cambios propuestos:**
- Definir el orden de categorías en la lista como configurable por hogar (cada súper tiene su propio layout de pasillos) — se agrega como campo `orden` en `categories`, ya presente en el seed (`data/seed/categorias.csv`).
- El FAB de "agregar ítem" tiene que estar disponible desde cualquier pestaña, no solo desde la lista.

**Veredicto:** APROBADO (con los cambios de orden configurable incorporados).

## Rol: UX (experiencia de uso)

**Observaciones:**
- La fricción real está en el súper, no en el sillón de casa: agregar un ítem a la lista debe ser 1-2 toques, y tildarlo como comprado debe permitir cargar cantidad/precio en el mismo gesto (ya incorporado al plan en la revisión anterior).
- Onboarding: el primer usuario crea el hogar e importa `productos_historico.csv`; después invita a los demás por link. No debería haber una pantalla de "tutorial" — la lista ya viene precargada con lo habitual, así que el valor se ve inmediatamente.
- Confirmaciones: usar "deshacer" (snackbar con Undo) en vez de diálogos de confirmación para acciones reversibles (borrar un ítem, marcar como comprado) — reduce fricción sin perder seguridad.
- Notificaciones: agrupar avisos diarios en un solo push ("3 productos por vencer, 2 por reponer") en vez de mandar uno por producto — evita que apaguen las notificaciones por saturación.

**Cambios propuestos:**
- Patrón "Undo" en vez de diálogos de confirmación.
- Notificaciones agrupadas (digest diario), no una por evento.

**Veredicto:** APROBADO.

## Rol: Marketing / identidad de marca

Es una app de uso doméstico, no un producto que se vende — pero eso no excluye tener una identidad prolija: se nota en el día a día y facilita compartirla si en el futuro se abre a otro hogar (familia, amigos).

- **Nombre:** se mantiene "ListaSuper" — ya está en uso (nombre del repo), es descriptivo, fácil de decir y de recordar, y no compite con marcas existentes conocidas.
- **Propuesta de valor (para el README del repo):** *"La lista de súper que se acuerda de lo que se te vence y de lo que se te está por acabar, para que no tengas que hacerlo vos."* — el diferencial real frente a Google Keep es control de stock + vencimientos + registro de compras, no la lista en sí.
- **Tono:** casero y directo, sin jerga técnica — conviven en el hogar personas no-técnicas, así que los textos de la app (vacíos, notificaciones, errores) tienen que hablarle a cualquiera, no a un desarrollador.
- **Ícono/color:** resuelto — canasta verde (`#16A34A`), ver `docs/branding-favicon.md`.

**Cambios propuestos:**
- Agregar la propuesta de valor como primera línea del `README.md` del repo cuando se haga el scaffold de Fase 0.
- Checklist de tono para textos de la UI: nunca un mensaje de error técnico crudo (ej. evitar mostrar errores de Postgres/Supabase sin traducir).

**Veredicto:** APROBADO.

## Rol: Accesibilidad

- Contraste: verificar que el verde de marca (`#16A34A`) sobre blanco y el blanco sobre verde cumplan WCAG AA para texto — el ícono ya lo cumple ampliamente (blanco puro sobre verde saturado).
- Touch targets ≥44×44px en toda la UI mobile (checkboxes de la lista, FAB, botones de cantidad).
- Formularios (registrar compra, revisión de OCR) con labels asociados correctamente para lectores de pantalla — relevante porque no todos los miembros del hogar van a tener el mismo nivel de destreza con el celular.
- Semáforo de vencimiento: no depender solo del color (rojo/amarillo/verde) — sumar ícono o texto ("Vence en 2 días") para usuarios con daltonismo.

**Cambios propuestos:**
- Semáforo de vencimiento con ícono + texto, no solo color.
- Checklist de accesibilidad como criterio de aceptación en cada fase, no como tarea aparte al final.

**Veredicto:** APROBADO.

---

## Informe de Consejo — ronda de roles UI/UX/Marketing/Accesibilidad

**Modo:** Claude sin subagentes (no hay `reviewer-opus/sonnet/haiku` disponibles en este entorno).

**Roles convocados:** UI, UX, Marketing/identidad de marca, Accesibilidad.

**Ronda 1:**
- Objeciones: orden de categorías fijo (UI), falta de patrón "Undo" y notificaciones granulares (UX), falta de propuesta de valor explícita (Marketing), semáforo dependiente solo del color (Accesibilidad).
- Cambios aplicados: orden de categorías configurable por hogar, patrón Undo + notificaciones agrupadas, propuesta de valor para el README, semáforo con ícono+texto.

**Veredicto de cada rol:** APROBADO (los 4).

### Pensamiento crítico

¿Qué tendría que ser cierto para que esto esté mal? Que el hogar prefiera notificaciones inmediatas por producto en vez de un digest diario (se puede hacer configurable más adelante si se nota que hace falta), o que el orden de pasillos varíe tanto entre compras que no valga la pena tenerlo como config fija por hogar (en ese caso, se resuelve mejor dejando reordenar manualmente la lista con drag & drop). Ninguno de los dos bloquea el MVP.

### Veredicto final de Consejo

**Recomendación:** incorporar estas 4 perspectivas al plan (ya aplicado en este documento) y dar el favicon/manifest por cerrado — es un entregable concreto, no solo una decisión de plan.

**Nivel de confianza:** Alto en el favicon (verificado visualmente en varios tamaños, licencia confirmada). Medio en las decisiones de UX (patrón Undo, digest de notificaciones) hasta probarlas con uso real del hogar.

**Qué haría primero:** avanzar a Fase 0 (scaffold Next.js + proyecto Supabase), ya con el favicon/manifest y el seed de productos listos para integrarse.

**Qué haría después:** Fase 1 (MVP núcleo) siguiendo las pantallas clave definidas en el rol UI.

---

## Auditoría de Fase 1 (roles Arquitectura/Seguridad/Testing, autónoma)

Antes de construir Fase 1 se re-auditó Fase 0 (advisors de seguridad/performance en cero, sin cambios necesarios). Durante la construcción de Fase 1 se encontraron y corrigieron en el momento (no quedaron como deuda):

- **Vista `product_stock` sin `security_invoker`**: por default una vista corre con los permisos de quien la creó (sin RLS), lo que hubiera dejado ver el stock de *todos* los hogares a cualquier usuario autenticado. Se agregó `with (security_invoker = true)`.
- **Conflicto RESTRICT/CASCADE**: `purchase_items.product_id` tenía `on delete restrict` (para no perder historial al borrar un producto individual), pero eso rompía el borrado de un hogar completo (dos caminos de cascada independientes desde `households`). Se cambió a `cascade`; la protección real contra pérdida de historial pasa a ser la columna `products.archived` (soft delete) a nivel de aplicación, no una restricción de FK.
- **Realtime no habilitado**: ninguna tabla nueva se agrega sola a la publicación `supabase_realtime`; sin esto la suscripción de la lista compartida en tiempo real jamás iba a recibir eventos (fallo silencioso, sin error visible). Se habilitó para `shopping_list_items`.
- **Policies RLS duplicadas** (`can view` + `can manage` con la misma condición): el linter de performance las marcó como innecesarias — se eliminaron las duplicadas.
- **`generate_invite_code()` con `search_path` mutable**: se le fijó `search_path` explícito.

Todo esto se verificó con pruebas reales contra la base (no solo revisión de código): se creó un hogar de prueba con 3 usuarios simulados (`auth.users` + JWT falso vía `request.jwt.claims`), se comprobó que el owner puede operar, que un segundo usuario se une correctamente por código de invitación y puede registrar una compra que descuenta la lista y suma stock, que un tercer usuario ajeno al hogar no puede leer ni escribir nada, y que el borrado en cascada de un hogar completo no rompe (antes rompía, ver arriba).

### Limitación de testing encontrada (no es un bug del código)

Este entorno sandbox tiene bloqueado por política de red el acceso saliente a `*.supabase.co` (mismo tipo de bloqueo que `ui.shadcn.com` en Fase 0; confirmado con `curl` y con `fetch` de Node, ambos devuelven un rechazo explícito del proxy/allowlist de egreso). Eso significa que **no se pudo probar el flujo completo por navegador dentro de esta sesión** (login → crear hogar → lista → comprar → stock), porque esas llamadas las hace el browser directo contra la API de Supabase. Se compensó con:
1. Pruebas SQL reales contra el proyecto (la lógica de negocio: RLS, RPCs, triggers) — esto es lo que valida que los datos estén bien protegidos y sea correcto, y sí se pudo hacer de punta a punta.
2. `npm run build` + `npm run lint` limpios (compila, tipa y lintea sin errores contra el esquema real generado).
3. Revisión manual línea por línea de cada llamada a Supabase del frontend contra el esquema y las RPCs.

Esto no bloquea el uso real de la app (Vercel y la computadora de cualquier usuario tienen internet sin esta restricción), pero sí significa que el primer uso real en producción hace de facto de test end-to-end — vale la pena prestarle atención a la primera compra/lista real por si aparece algo que esta auditoría no pudo ver.

---

## Pasada de responsive / "sentirse nativo" en iOS

A pedido explícito del usuario, se hizo una pasada dedicada a que la app se sienta bien en el celular, en particular en iOS/Safari (que tiene varias particularidades que Android no tiene). Cambios, todos verificados con `npm run build`/`npm run lint` limpios y capturas reales en Chromium a 375px y 390px de ancho (los anchos de iPhone más comunes):

- **`viewport-fit=cover`** agregado al viewport: sin esto, `env(safe-area-inset-*)` vale `0` siempre en iOS y no hay forma de evitar que el contenido quede tapado por el notch o la barra de home. A propósito **no** se fijó `maximum-scale`/`user-scalable=no` — bloquear el pinch-to-zoom mejora nada la sensación "nativa" pero rompe accesibilidad (WCAG 1.4.4).
- **Meta tags de Apple** (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`) sumados además del `mobile-web-app-capable` moderno que Next genera solo — iOS viejo todavía depende de los primeros para que "Agregar a inicio" abra en modo standalone (sin la barra de Safari) en vez de como una pestaña más.
- **Safe areas reales, no solo el nav**: el header (ahora `sticky top-0`) y el contenido principal respetan `env(safe-area-inset-top/left/right)`, y las barras de acción flotantes ("Confirmar compra") en Lista y Comprar dejaron de usar un offset fijo (`bottom-16`) — con notch/home indicator eso las dejaba tapadas por el nav. Ahora calculan `calc(4rem + env(safe-area-inset-bottom))` contra una altura de nav fija y conocida.
- **Los inputs de cantidad/precio en Comprar tenían `text-sm` (14px)**: por debajo de 16px, Safari en iOS hace zoom automático al enfocar el campo — un comportamiento muy poco "nativo". Se subieron a `text-base` (16px), igual que el resto de los inputs.
- **Touch targets**: los checkboxes de la lista y los botones +/- de cantidad medían 24-28px, por debajo del mínimo de 44×44 que la propia Fase 0 (rol Accesibilidad) se había comprometido a respetar. Se agrandó el área táctil real sin agrandar tanto el ícono visual (hit area de 44/36px con un glifo más chico adentro).
- **Micro-detalles táctiles**: se sacó el resaltado gris que Safari muestra al tocar (`-webkit-tap-highlight-color`), se evitó el rebote de scroll de doble nivel (`overscroll-behavior`), se agregó `touch-manipulation` + `select-none` a los botones para que no haya selección de texto accidental ni delay al tocar, y los estados de color pasaron a reaccionar también a `active:` (no solo `hover:`, que en iOS puede quedar "pegado" después de un toque).
- **Bug de paso (no relacionado a iOS, encontrado de rebote)**: `body` tenía un `font-family: Arial` hardcodeado que pisaba la fuente Geist ya cargada — la tipografía elegida en Fase 0 nunca se estaba aplicando. Corregido.

No se armó splash screen específico para iOS (`apple-touch-startup-image` por tamaño de dispositivo) — es papeleo de bajo impacto para un hogar de 2 personas; se puede sumar más adelante si se nota falta.
