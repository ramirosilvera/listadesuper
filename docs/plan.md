# Plan de ListaSuper

Documento vivo con el plan completo del proyecto: arquitectura, modelo de datos, roadmap y las decisiones de diseño/marca. Se actualiza a medida que el Consejo revisa y el plan evoluciona.

**Estado actual:** Fases 0 a 5 completas (setup, MVP núcleo, vencimientos, responsive/iOS, predicción de reposición e informes gráficos) — la app es utilizable de punta a punta.

**Decisión del usuario:** por ahora, sin notificaciones push/email (Fase 2) y sin OCR de tickets (Fase 3). Quedan fuera de alcance hasta que se pida explícitamente retomarlas — no son un pendiente activo. El semáforo de vencimientos y la sección "se están por acabar" ya cubren el caso de uso mirando la app.

**Único paso manual restante:** conectar el repo a Vercel para que la app tenga una URL real (fuera del control de esta sesión — no hay conector de Vercel disponible acá). Ver instrucciones paso a paso conversadas con el usuario.

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
- **Fase 4 — Predicción de reposición (✅ completa):** vista `product_replenishment` (no una tabla `consumption_estimates` aparte — todo derivado de `stock_movements`, siempre fresco, sin job que la actualice). Modo híbrido tal como se había acordado: predicción automática por consumo real (ventana móvil de hasta 90 días, activa recién con ≥2 bajas de stock — con un solo dato no hay tasa confiable) + umbral manual configurable por producto (`products.low_stock_threshold`) como fallback desde el día 1. Sección "Se están por acabar" en la Lista, con un toque para agregar. Edición del umbral manual inline desde Stock.
- **Fase 5 — Informes gráficos (✅ completa):** vistas `spending_by_category_30d`, `spending_by_week` y `top_products_90d` (derivadas de `purchases`/`purchase_items`, siempre frescas). Pestaña "Reportes" nueva en el nav (dashboard con 3 stat tiles, gasto por categoría en barras, evolución de gasto en línea, top productos). Se usó [Recharts](https://recharts.org) vía npm — no bloqueado, a diferencia de shadcn/ui — con la paleta categórica de referencia del skill de dataviz (orden fijo ya validado contra daltonismo, no cicla por producto) y los colores de estado ya establecidos en Fase 2 para los stat tiles. Verificado renderizando el componente con datos de ejemplo en una ruta temporal (borrada antes de commitear) para revisar visualmente barras/línea/leyenda antes de darlo por cerrado, tal como pide el paso 7 del skill.
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

---

## Fase 6: carga inicial real + sugerencias en Comprar (a pedido del usuario, autónoma)

Con la cuenta y el hogar "Casa" ya creados en producción, el usuario pidió tres cosas: (1) importar el catálogo normalizado del histórico de Keep, (2) cargar fechas de vencimiento "como si se hubiera comprado todo hoy" pero editables, y (3) que Comprar sugiera qué renovar para minimizar la carga manual.

**Ejecutado directamente contra el proyecto real** (`ijzgaudtadsnvkkmjhbb`, hogar "Casa", `1ce27171-…`) vía SQL admin, no solo como código disponible para apretar un botón:
- 12 categorías + 140 productos importados (misma normalización ya validada del histórico de Keep).
- Nueva RPC `seed_initial_stock(p_household_id)` (SECURITY DEFINER, idempotente — solo llena huecos, se puede volver a correr): carga 1 unidad de stock por producto sin movimientos previos, y un vencimiento estimado (hoy + `default_shelf_life_days`) por producto sin vencimiento activo. Corrida una vez para "Casa": 140 productos con stock, 140 con vencimiento estimado.
- Botón "Cargar stock inicial" en Ajustes para poder repetir esto a futuro (ej. si se agregan productos nuevos al catálogo).

**Supuesto explícito (no un hecho verificado)**: se asumió 1 unidad de cada producto como punto de partida, porque no hay forma de saber la cantidad real que el usuario tiene en la alacena hoy. Es una aproximación deliberada y de bajo costo de corrección — todo es editable con un toque desde Stock (+/-) y ahora también la fecha de vencimiento directamente desde Vencimientos (antes solo se podía marcar como consumido/descartado, no editar la fecha).

**Comprar** ahora hace dos cosas para reducir tipeo:
- Precarga la fecha de vencimiento sugerida por fila usando `default_shelf_life_days` del producto (la misma cuenta que ya hacía `record_purchase` en el server si no se mandaba fecha) — editable, no forzada.
- Suma una sección "Sugeridos para reponer" con los mismos candidatos de `product_replenishment` que ya se mostraban en Lista ("Se están por acabar"), para agregar a la compra de un toque productos que no estaban tildados en la lista.

**Aclaración importante para el usuario**: como recién se cargó todo con stock=1 y sin historial de consumo ni umbral manual, los chips "Sugeridos para reponer" van a aparecer vacíos hasta que haya al menos 2 bajas de stock reales en 90 días (predicción automática) o se configure un umbral manual por producto desde Stock — esto es el diseño ya aprobado en Fase 4, no una falla de esta carga inicial.

Verificado con `tsc --noEmit` y `npm run lint` limpios, y con conteos reales post-carga contra la base (140/140/140/140 en productos, movimientos, vencimientos activos y productos con stock > 0).

---

## Pasada de rendimiento (a pedido del usuario, "la app se siente lenta")

El usuario pidió precarga, caché y una tarjeta de "cargando" para la primera apertura. Antes de tocar código se leyó `node_modules/next/dist/docs/` (obligatorio por `AGENTS.md`: esta versión de Next, la 16.3.5, cambia bastante el modelo de cache respecto a versiones anteriores) para no aplicar una API de una versión distinta a la instalada.

**Hallazgo concreto (HECHO, verificado leyendo el código, no un supuesto)**: `getActiveHousehold()` se llama dos veces por navegación — una en `(app)/layout.tsx` y otra de nuevo en cada `page.tsx` (Lista, Stock, Comprar, Reportes, Ajustes) — y no estaba envuelta en `cache()` de React, así que cada visita pagaba el trabajo de auth + consulta a `household_members` **dos veces** en vez de una. Es exactamente el caso que la propia documentación de Next describe como "Deduplicating requests". Se corrigió envolviendo la función con `cache()` (`src/lib/household.ts`) — mismo resultado, la mitad de las idas y vueltas por navegación.

**Tarjeta de "cargando"**: se agregó `loading.tsx` a cada pestaña (Lista, Stock, Comprar, Reportes, Ajustes) con un esqueleto (`ListSkeleton` en `src/components/loading.tsx`) que imita la forma real de cada lista — Next.js lo muestra automáticamente vía Suspense mientras la página server-side todavía está pidiendo sus datos, así que cambiar de pestaña se siente instantáneo aunque la consulta tarde lo mismo que antes.

**Lo que se descartó y por qué (para no aplicar "más caché" a ciegas)**:
- Un `loading.tsx` a nivel del layout completo (`(app)/loading.tsx`) se armó primero y después se sacó: la documentación aclara explícitamente que si el layout hace `await` de datos sin envolverlo en Suspense (que es nuestro caso, `getActiveHousehold()` corre directo en `(app)/layout.tsx`), **la navegación queda bloqueada hasta que el layout termina y ningún `loading.tsx` de ese nivel llega a mostrarse** — hubiera sido código que aparenta arreglar algo sin hacerlo. Los `loading.tsx` por pestaña sí funcionan porque el layout no se vuelve a ejecutar al cambiar de tab (solo la primera vez que se entra a la app después del login).
- `staleTimes` (cache experimental del router del lado del cliente): permitiría reusar una pestaña ya visitada sin volver a pedirle nada al servidor por un rato — pero eso significa que si alguien del hogar registra una compra o ajusta stock, la otra persona podría ver datos viejos en Stock/Comprar por esos segundos. Justo lo contrario de lo que esta app necesita (datos compartidos y al día entre el hogar). Se decidió no activarlo.
- Cachear la consulta de catálogo (productos/categorías) con `unstable_cache`: la tabla es chica (140 productos, ya indexada por `household_id` desde Fase 1) y la ganancia real es marginal, mientras que mantenerla cacheada correctamente requeriría invalidarla a mano en cada lugar que crea/edita un producto (Ajustes, Comprar, Lista, el futuro CRUD de Stock) — más riesgo de bugs de "caché vieja" que beneficio real.

Verificado con `tsc --noEmit`, `npm run lint` y `npm run build` (con `rm -rf .next` antes) limpios; el build confirma que las 5 rutas siguen dinámicas (`ƒ`) como corresponde a datos por-usuario con RLS.

---

## Primera carga de umbrales de reposición (a pedido del usuario)

Con la carga inicial de Fase 6 (1 unidad por producto, sin `low_stock_threshold`), las sugerencias "para reponer" iban a quedar vacías hasta acumular 2 bajas de stock reales por producto — comportamiento correcto pero frustrante para una primera carga. El usuario pidió poblar esos umbrales desde ahora, en base a usos y costumbres típicos de una casa de un hombre de 35, una mujer de 36 y una bebé de 1 año (más un gato, según el propio catálogo — "Piedras sanitarias para gato (Leo)").

**Criterio aplicado (JUICIO, no un hecho medido)**: se clasificó cada uno de los 140 productos en dos grupos:
- **`low_stock_threshold = 1`** ("avisar con la última unidad que queda") para 41 productos: todo lo de uso diario/muy frecuente para 2 adultos (aceite de oliva, arroz, azúcar, fideos comunes, harina, sal, pan, leche, huevos, manteca, yogur, queso rallado, yerba mate, agua mineral, pasta dental, shampoo, desodorante), lo que se dispara más al tener un bebé en casa (detergente de ropa, suavizante, lavandina, detergente lavavajillas, esponja de cocina, algodón, pañuelos descartables, papel higiénico, rollo de cocina, bolsas de basura), todo lo crítico específico de la bebé (pañales, toallitas húmedas, jabón de ropa hipoalergénico, jabón para bebé) y la arena del gato.
- **`low_stock_threshold = 0`** ("avisar recién cuando se terminó") para los 99 restantes: condimentos y productos de compra ocasional, variantes secundarias/backup de algo ya cubierto por otro producto (para no duplicar la misma alerta dos veces), insecticidas/repelentes estacionales, etc.

Se aplicó directamente en la base (`update products set low_stock_threshold = ...`, sin migración — es dato del hogar, no esquema) y se verificó contra `product_replenishment`: **41 de 140 productos** quedan marcados `should_restock = true` de entrada.

**Aclaración importante**: como la carga inicial (Fase 6) puso `quantity_on_hand = 1` para todo, cualquier producto con `threshold = 1` queda "para reponer" inmediatamente — es intencional (esos 41 son justamente los que no se quiere que falten), pero significa que el usuario va a ver ~41 sugerencias apenas entre a Lista/Comprar, no una lista corta. Si alguno de esos productos en realidad tiene más de 1 unidad guardada en casa, se corrige en un toque desde Stock (+/-), igual que cualquier otro ajuste de cantidad.

**Decisión de alcance**: esto se hizo como una acción de datos puntual para este hogar, no se hardcodeó la composición familiar (2 adultos + bebé) dentro de `seed_initial_stock` ni de ningún otro código reusable — esos supuestos son específicos de esta casa y no deberían aplicarse automáticamente si el hogar cambia o si otro hogar usara la misma app. Los umbrales siguen siendo 100% editables por producto desde Stock, como ya lo eran antes de esta carga.

---

## Fase 7: archivar productos (a pedido del usuario)

El usuario pidió poder sacar un producto de circulación (ejemplo real: "Pañales Pampers talle G", ya no lo necesita) sin que siga apareciendo en Stock ni en sugeridos para reponer.

`products.archived` ya existía desde Fase 1 como soft delete pensado exactamente para esto (no se borra el producto para no perder el historial de compras/gastos en Reportes), pero no había ninguna forma de activarlo desde la UI. Se agregó:

- **Stock**: botón para quitar un producto del catálogo, con confirmación inline (sin diálogos nativos del navegador, consistente con el resto de la app) antes de marcar `archived = true`.
- **Ajustes**: sección "Productos archivados" (solo visible si hay alguno) con botón "Reactivar" por producto — soft delete reversible, no hay forma de perder el producto por error.
- **Bug encontrado al revisar esto**: la vista `product_expirations_upcoming` no filtraba por `products.archived` (a diferencia de `product_replenishment`, que sí lo hacía desde Fase 4) — un producto archivado seguía apareciendo en la pestaña Vencimientos. Corregido en la misma migración (`fase7_archivar_productos`).

Aplicado y verificado en el hogar real: "Pañales Pampers talle G" archivado, confirmado en `0` en `product_replenishment`, `product_expirations_upcoming` y el catálogo activo. `tsc --noEmit`, `npm run lint` y `npm run build` limpios.

---

## Fase 8: reponer también por "hace cuánto no lo compramos" + revisión de UX de carga

### Ciclo de compra (control adicional al stock)

El usuario marcó una limitación real del diseño de Fase 4: el umbral de stock no tiene sentido para productos que se compran por hábito en un intervalo mas o menos fijo, independientemente de cuántas unidades queden — su ejemplo: aceite de oliva se compra 1 vez por mes, así que "avisar con 1 o menos" es inútil ahí. Pidió un mecanismo adicional basado en **tiempo desde la última compra**, editable por producto, que sirva además como red de seguridad si se olvidan de actualizar el stock a mano.

Se agregó una tercera señal a `product_replenishment` (`restock_cycle_days` en `products`, nuevo, editable desde Stock igual que el umbral): si pasaron más días que el ciclo definido desde la última vez que el producto sumó stock (`stock_movements` con `delta > 0` — cubre tanto compras reales como la carga inicial de Fase 6), se marca `should_restock = true` con motivo `'ciclo_de_compra'`, **sin importar cuántas unidades queden**. Las tres señales (predicción automática por consumo real, umbral manual de stock, ciclo de compra) se combinan con OR: cualquiera que se cumpla dispara la sugerencia — exactamente "toma de referencia el stock y/o la fecha de compra" como lo pidió el usuario.

Probado con una simulación SQL (sin persistir nada): un producto con 3 unidades en stock (muy por encima de cualquier umbral) y una compra simulada de hace 40 días con ciclo de 30 días efectivamente dispara `should_restock = true` solo por el ciclo — confirma que el control adicional funciona independientemente del stock.

Se cargó `restock_cycle_days` para 39 de los 41 productos ya priorizados en la carga de umbrales (Fase 6.5), en tres niveles (15/21/30 días) según frecuencia típica de uso para esta casa — incluye el ejemplo explícito del usuario (aceite de oliva → 30 días). Quedó afuera "Pan" a propósito: con 3 días de vida útil ya lo cubre bien el mecanismo de vencimientos: un ciclo de compra aparte ahí sería redundante. Los chips de "Se están por acabar" (Lista) y "Sugeridos para reponer" (Comprar) ahora muestran también el motivo (`restockReasonLabel` en `src/lib/restock.ts`): "se está por acabar" / "queda poco stock" / "hace tiempo no lo comprás".

### Revisión de UI/UX: pantalla negra durante la carga

El usuario reportó que al cargar algo, la pantalla se queda negra y no se sabe si el toque se registró. Investigando (con foco en modo oscuro, donde `--background` es `#0a0a0a`, casi negro):

- **Causa real encontrada**: `useLinkStatus` (Next.js) no estaba usado en ningún lado, así que tocar una pestaña del nav no daba ninguna señal instantánea de que el tap se había registrado — recién se veía algo cuando la respuesta del servidor empezaba a llegar. Se agregó un hint visual inmediato por pestaña (`TabTapHint` en `nav-bar.tsx`) que se activa apenas se registra el tap, antes de que llegue cualquier respuesta.
- **Segunda causa real**: en Login, Onboarding y Comprar, el botón volvía a su estado normal ("Entrar", "Crear hogar", "Registrando…" → texto normal) **antes** de que la navegación terminara de resolver, porque `setLoading(false)` se llamaba apenas terminaba la llamada a Supabase, no cuando la pantalla nueva ya estaba lista. Corregido: ahora el botón se mantiene en su estado de carga hasta que la navegación reemplaza la pantalla (solo se resetea en el camino de error).
- **Tercera causa**: el esqueleto de carga (`ListSkeleton`, agregado en la pasada de rendimiento anterior) usaba `dark:bg-zinc-900` para las barras animadas contra un fondo de fila `dark:bg-zinc-950` — casi el mismo tono, muy poco contraste en modo oscuro, se veía como "no está pasando nada". Subido a `dark:bg-zinc-800`.

No se tocó el fondo oscuro en sí (`#0a0a0a`): es el modo oscuro correcto de la app, el problema era la falta de señales durante la espera, no el color de fondo.

Verificado con `tsc --noEmit`, `npm run lint` y `npm run build` limpios.

---

## Fase 9: invitar por WhatsApp con unión automática

El usuario pidió que el código de invitación se pueda compartir directamente por WhatsApp y que quien recibe el link termine unido al hogar solo — sin pegar el código a mano, y creando cuenta de una si todavía no tiene.

- **`/join/[codigo]`** (nueva ruta, fuera del grupo `(app)` porque es justo para gente que todavía no tiene hogar): sin sesión, redirige a `/login?mode=signup&next=/join/<codigo>`; con sesión y sin hogar, llama a `join_household_by_code` (la misma RPC que ya existía para el flujo manual) y redirige a `/lista`; con sesión y ya con un hogar, muestra un aviso en vez de unir en silencio — el modelo de datos sigue siendo "un hogar activo por usuario" (MVP), así que unir sin avisar hubiera dejado el hogar "activo" en un estado ambiguo.
- **Login** ahora lee `next` y `mode` de la URL (`useSearchParams`, con el formulario movido a `login-form.tsx` y envuelto en `Suspense` en `page.tsx` — Next.js exige ese boundary para no perder el prerender estático de la página): entrar o crear cuenta redirige a `next` si vino uno, en vez de siempre a `/`. Así el link hace todo el circuito en una sola pasada: sin cuenta → crear cuenta → unido al hogar; con cuenta → entrar → unido al hogar.
- **Ajustes**: botón "Compartir por WhatsApp" (`wa.me/?text=...`, sin SDK, funciona igual en el celular con la app instalada y en WhatsApp Web) que arma el mensaje con el link `/join/<codigo>`. El código a secas sigue visible abajo por si prefieren compartirlo de otra forma (setelo dicho de palabra, otro medio) — no se sacó el flujo manual de "Unirme con código" en Onboarding.
- Metadata propia en `/join/[codigo]` (título/descripción para que la vista previa del link en WhatsApp no salga en blanco, `robots: noindex` porque es un link de invitación, no algo para indexar).

Sin cambios de esquema — reutiliza `join_household_by_code` tal cual. Verificado con `tsc --noEmit`, `npm run lint` y `npm run build` limpios (`/join/[code]` sale dinámica, `/login` se mantiene estática pese al `useSearchParams` gracias al `Suspense`).

---

## Limpieza: tarjetas de uso único en Ajustes

El usuario pidió sacar de Ajustes las tarjetas "Catálogo inicial" y "Stock inicial" (y todo su estado/handlers en `ajustes-client.tsx`): eran acciones de una sola vez, ya usadas para este hogar, y quedaban ahí sin ningún propósito recurrente.

**Decisión de alcance**: se sacó el botón de la UI, pero **no** se borró `import-seed-action.ts` (el Server Action) ni la RPC `seed_initial_stock` — siguen existiendo como capacidad de backend, por si hiciera falta repetir el import o la carga inicial más adelante (otro hogar, un reseteo, productos nuevos en el CSV). Son inofensivos sin un botón que los dispare, y borrarlos hubiera sido un cambio más grande que "sacar las tarjetas" — si en algún momento se confirma que nunca más van a hacer falta, ahí sí tiene sentido borrarlos del todo.

Verificado con `tsc --noEmit`, `npm run lint` y `npm run build` limpios (sin imports ni variables sin usar tras sacar el código muerto en el cliente).

No se armó splash screen específico para iOS (`apple-touch-startup-image` por tamaño de dispositivo) — es papeleo de bajo impacto para un hogar de 2 personas; se puede sumar más adelante si se nota falta.
