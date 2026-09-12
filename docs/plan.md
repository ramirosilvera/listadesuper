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

---

## Fase 10: auditoría de UX en el rol de "primera usuaria" (a pedido del usuario)

El usuario pidió que actuara como su esposa recibiendo la app por primera vez por WhatsApp, revisara su experiencia real y corrigiera lo que hiciera falta. Sin poder abrir un browser real contra Supabase desde este entorno (bloqueo de red ya documentado), se hizo con dos fuentes reales en vez de suposiciones: los datos reales del hogar "Casa" en Supabase, y una lectura línea por línea de cada pantalla que ella recorrería en su primera sesión (login vía `/join/[codigo]` → Lista → Stock → Comprar → Reportes → Ajustes).

**Hallazgo real, verificado con datos (no hipótesis)**: la carga inicial de Fase 6 simuló "como si se hubiera comprado todo hoy" incluyendo productos de vida útil muy corta (Pan y Tarta, 3 días). Un día después, `product_expirations_upcoming` ya los mostraba en rojo ("vence en 2 días") — una alarma falsa para algo que en realidad nadie compró "hoy", justo el tipo de primera impresión que rompe la confianza en la app. Se resolvieron (mismo mecanismo que "Ya lo usé", `status='consumed'`, no destructivo) los 5 vencimientos sembrados sin compra real (`purchase_item_id is null`) con vida útil ≤15 días (Pan, Tarta, Morrón, Crema, Yogur) — los de vida útil larga no generan el mismo problema visible a corto plazo, así que se dejaron.

**Hallazgo real de volumen**: con los umbrales y ciclos de compra ya cargados (Fases 6.5 y 8), la primera vez que ella abra Lista o Comprar va a ver **40 sugerencias** de una — separado de si eso es útil, es demasiado para procesar de un vistazo antes de haber usado la app ni una vez. Se extrajo un componente compartido `RestockChips` (`src/components/restock-chips.tsx`, usado por Lista y Comprar, reemplaza el bloque que estaba duplicado en los dos archivos) que muestra las primeras 8 sugerencias con un "+N más" para expandir el resto — mismo dato, menos abrumador de entrada.

**Hallazgo real de ruido visual en Stock**: cada uno de los 140+ productos mostraba dos textos siempre visibles ("Avisar con poco stock" / "Sin ciclo de compra") aunque no estuvieran configurados — para alguien nueva, sin contexto de qué son esos dos conceptos, es ruido en cada una de más de cien filas. Se consolidó en un solo ícono de ajustes (⚙) por producto que abre un panel combinado con ambos campos; el texto bajo el nombre del producto ahora solo aparece cuando algo está configurado ("Avisar con 1 · cada 30 días"), no como placeholder permanente.

**Nota real encontrada de paso**: al revisar los datos vivos aparecieron 2 productos nuevos ("Pizza Sibarita", "Enjuague bucal") creados el 12/09 por uso real de la app — no es un bug, es la evidencia de que ya la están usando de verdad; sirvió además para confirmar que el flujo de "agregar producto nuevo" y de configurar umbral/ciclo ya funcionaban en producción antes de este cambio.

Verificado con `tsc --noEmit`, `npm run lint` y `npm run build` limpios.

No se armó splash screen específico para iOS (`apple-touch-startup-image` por tamaño de dispositivo) — es papeleo de bajo impacto para un hogar de 2 personas; se puede sumar más adelante si se nota falta.

---

## Revisión de ciclos de compra con datos reales (a pedido del usuario)

El usuario pidió revisar los `restock_cycle_days` de todo el catálogo dado un hecho nuevo: la familia va **todas las semanas** al súper. La ronda anterior (Fase 8) había usado 3 niveles genéricos (15/21/30 días) basados en supuestos de uso típico, sin ese dato.

**Cambio de método**: en vez de repetir el mismo tipo de estimación genérica, se usó `frecuencia_historica` del CSV original (`data/seed/productos_historico.csv`) — cuántas veces aparece cada producto en el historial real de Google Keep del usuario — como evidencia principal, calibrada contra el hecho de que compran cada 7 días:

| frecuencia histórica | ciclo asignado |
|---|---|
| ≥ 12 | 7 días (casi todas las semanas) |
| 6-11 | 14 días |
| 4-5 | 21 días |
| 2-3 | 28 días |
| 1 / ambiguo | sin ciclo (no hay patrón real de recompra) |

Esto **corrigió varios supuestos equivocados** de la ronda anterior: por ejemplo, Yerba mate y Agua mineral se habían puesto en 15 días asumiendo consumo diario típico argentino, pero el historial real muestra frecuencia 3 y 1 respectivamente — se ajustaron a 21 días y sin ciclo. Yogur y Queso rallado, que se habían marcado como uso frecuente, en el historial real aparecen una sola vez — se les sacó el ciclo.

**Excepciones deliberadas a la fórmula (juicio, no el cálculo automático)**:
- **Aceite de oliva** se dejó en 28 días (no 14, que hubiera sugerido la frecuencia 6) porque el usuario dijo explícitamente en un pedido anterior que lo compran "una vez por mes" — su palabra directa pesa más que la inferencia del historial.
- **Pan y Tarta** se dejaron sin ciclo a propósito: con 3 días de vida útil, Vencimientos ya avisa mucho antes que cualquier ciclo — sumarlo sería redundante.
- **Insecticidas/repelentes** se dejaron todos sin ciclo por ser estacionales, aunque alguno tuviera frecuencia 2.
- **Productos de bebé** (toallitas húmedas, jabones) mantuvieron un ciclo pese a frecuencia histórica baja: el historial de Keep no necesariamente cubre el tiempo en que la bebé ya estaba en la familia, y la necesidad es actual y va a seguir.
- Los 2 productos agregados por uso real después de la carga inicial ("Pizza Sibarita", "Enjuague bucal") no se tocaron — no hay dato histórico para ellos y "Enjuague bucal" ya tenía un ciclo cargado manualmente por el propio usuario.

**Resultado aplicado y verificado** en el hogar real: 6 productos a 7 días, 9 a 14, 23 a 21, 26 a 28, y 77 sin ciclo (de 139 productos del catálogo original, sin tocar los 2 agregados manualmente). Se confirmó que esto no generó sugerencias nuevas de golpe (0 activadas por `ciclo_de_compra` todavía — recién se cargó stock "hoy", ningún ciclo cumplió su plazo aún) y que las 40 sugerencias existentes por umbral de stock siguen iguales. Cambio de datos puro, sin tocar esquema ni código — no hizo falta migración.

---

## Revisión de vencimientos (`default_shelf_life_days`) con fuentes oficiales

El usuario pidió revisar los vencimientos sugeridos del stock con web search y fuentes confiables, en vez de estimación propia. Se priorizaron los productos lácteos frescos: son los de mayor riesgo real (una fecha mal calculada ahí puede llevar a comer algo en mal estado, a diferencia de un almacén no perecedero donde el peor caso es un aviso de más). Fuente principal: **USDA FoodKeeper** (desarrollada por el Food Safety and Inspection Service del USDA con Cornell University y el Food Marketing Institute — foodsafety.gov), citada vía búsqueda web con varias fuentes secundarias que la referencian directamente.

**Cambios aplicados** (valor anterior → nuevo, con la guía que lo respalda):
- **Leche** (genérica/ambigua — ya estaba marcada "a confirmar" desde la importación original): 90 → **7 días**. El USDA indica que la leche abierta dura ~7 días en heladera; 90 días solo tendría sentido si fuera 100% larga vida (UHT) sin abrir, pero eso ya está cubierto por el producto separado "Leche larga vida" (se dejó en 90). Ante la ambigüedad ya señalada, se corrigió hacia el valor más conservador (más seguro) en vez del más largo.
- **Manteca**: 20 → **45 días**. El USDA indica manteca con sal: 1-3 meses refrigerada después de la fecha impresa. El valor anterior era demasiado corto — generaba avisos de "se vence" para manteca que en realidad todavía está bien (mismo problema de "falsa alarma" ya corregido antes con el pan).
- **Queso crema**: 30 → **14 días**. El USDA es explícito: queso crema abierto, 2 semanas. El valor anterior casi lo duplicaba.
- **Queso cremoso**: 20 → 15 días. Ajuste parcial hacia la categoría "quesos blandos" del USDA (7 días) sin adoptarla del todo — el "queso cremoso" argentino es más firme que un queso blando tipo brie/ricotta y no hay una fuente que lo mapee 1 a 1; se marca como **límite de la fuente** (JUICIO, no dato verificado directamente).
- **Queso duro / Queso para rallar**: 60 → **45 días** cada uno. El USDA dice 3-4 semanas para queso duro ya abierto, pero estos productos se compran en pieza entera para rallar en casa (dura más que un bloque ya cortado) — se corrigió hacia abajo sin adoptar el número más corto de "ya abierto".

**Revisado y dejado igual (ya estaba bien respaldado)**: Huevos (21 días cae dentro del rango USDA de 3-5 semanas), Crema de leche (10 días coincide exactamente con la guía de USDA para crema abierta), Mayonesa (90 días está en el límite superior del rango USDA de 60-90 días), Arroz/Fideos/Harina/Azúcar/Sal/Aceite (todos los valores actuales ya son iguales o más conservadores que la guía de "años" para productos de almacén no perecederos). **Pan** se dejó en 3 días a propósito: la guía de USDA sobre "pan comercial" (14-18 días) aplica a pan envasado con conservantes; el "Pan" de esta familia es, con altísima probabilidad, pan de panadería fresco sin conservantes (frecuencia histórica muy alta, compra frecuente) — un producto distinto, con vida útil real mucho más corta, y aplicar la cifra genérica de EE.UU. hubiera sido un error.

Se actualizaron también las 6 fechas de vencimiento ya sembradas en Fase 6 para estos productos (recalculadas desde la misma fecha de carga inicial con el nuevo `default_shelf_life_days`), no solo el valor por defecto para compras futuras — si no, el catálogo hubiera quedado corregido pero el aviso activo de Leche hubiera seguido mostrando diciembre en vez de la fecha real corregida (18/09).

**Limitación declarada**: no se revisaron con fuentes externas los productos de limpieza, higiene, insecticidas ni bienes durables — no tienen una "fecha de vencimiento" en el sentido de seguridad alimentaria (es más bien pérdida de eficacia), y no hay una fuente única y confiable equivalente al USDA FoodKeeper para esa categoría. Se mantiene lo ya cargado. Cambio de datos puro, sin tocar esquema ni código.

Fuentes consultadas (USDA FoodKeeper y fuentes que lo citan directamente):
- [ask.fsis.usda.gov — How long can you keep dairy products like yogurt, milk, and cheese in the refrigerator?](https://ask.fsis.usda.gov/article/How-long-can-you-keep-dairy-products-like-yogurt-milk-and-cheese-in-the-refrigerator)
- [fsis.usda.gov — Shell Eggs from Farm to Table](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/eggs/shell-eggs-farm-table)
- [fsis.usda.gov — Shelf-Stable Food Safety](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/shelf-stable-food)
- [survivalfreedom.com — How Long Does Butter Last? (USDA Guidelines)](https://survivalfreedom.com/how-long-does-butter-last/)
- [pantryprofessor.com — How Long Does Mayonnaise (Opened) Last?](https://pantryprofessor.com/food-storage/mayo/)
- [onbetterliving.com / mill.com — Cheese, yogurt, heavy cream shelf life after opening](https://www.mill.com/blog/how-long-does-cheese-last-in-the-fridge)

---

## Historial de compras (a pedido del usuario)

El usuario preguntó dónde ver las fechas de compra de cada producto, o el historial de cada "lista semanal". Al revisar, era un hueco real: esa información existe en la base (`purchases`, `purchase_items`, y `last_restocked_at` ya calculado en `product_replenishment` desde Fase 8) pero no se mostraba en ningún lado de la UI.

**Hecho confirmado al revisar los datos**: ya hay 3 compras reales cargadas por la familia (Azúcar/Blem pisos/Cif crema en "Día"; Enjuague bucal; Pizza Sibarita) — la pregunta no era hipotética, ya la habían usado y no encontraban dónde volver a verla.

**Aclaración de modelo de datos importante**: no existe un objeto "lista semanal" en el esquema — la lista compartida (`shopping_lists`) es una sola, continua, y nunca se archiva ni se crea una nueva por semana (eso ya era así desde Fase 1, no es algo nuevo de este cambio). Lo más parecido a "la lista de esta semana" que sí existe es cada fila de `purchases`: un registro con fecha, súper y los productos de esa compra puntual. Se usó eso, no se inventó un concepto nuevo de "semana".

**Cambios**:
- **Stock**: cada producto ahora muestra "Última compra: DD/MM" (dato ya calculado en `product_replenishment`, solo faltaba mostrarlo) cuando hay alguna.
- **Reportes**: se le agregaron pestañas ("Resumen" / "Historial", mismo patrón que Stock/Vencimientos). "Historial" lista las compras más recientes (fecha, súper, cantidad de productos, total si se cargó precio) y cada una se puede tocar para expandir el detalle línea por línea.

Sin cambios de esquema — reutiliza `purchases`/`purchase_items`/`stores` tal cual y el `last_restocked_at` de Fase 8. Verificado con `tsc --noEmit`, `npm run lint` y `npm run build` limpios.

---

## Corrección: "Pan" es pan de molde comercial, no de panadería

En la revisión de vencimientos con fuentes oficiales se había dejado "Pan" en 3 días asumiendo (JUICIO, declarado como tal en ese momento) que era pan de panadería fresco sin conservantes, en base a su alta frecuencia histórica de compra. El usuario corrigió ese supuesto directamente: es pan de molde comercial envasado. Se actualizó `default_shelf_life_days` de 3 a **14 días**, alineado con la guía ya citada en la revisión anterior para pan comercial envasado (14-18 días sin abrir en la despensa). No había ningún vencimiento activo sembrado para Pan en este momento (ya se había resuelto en la limpieza de Fase 10), así que no hizo falta recalcular ninguna fecha ya cargada — el nuevo valor rige desde la próxima compra. `restock_cycle_days` se mantiene sin ciclo: con 14 días de vida útil, Vencimientos ya avisa a tiempo, un ciclo aparte seguiría siendo redundante. Cambio de dato puro, sin tocar esquema ni código.

---

## Fase 11: sugerencias inteligentes basadas en el historial de uso

El usuario pidió un sistema que, en función del uso real de la app (historial de compras/consumo), sugiera solo: cambios de ciclo de compra, ajustes de umbral de stock bajo, y archivado de productos inactivos.

**Encuadre honesto (JUICIO declarado antes de construir nada)**: no hay infraestructura de ML real en este proyecto — sin pipeline de entrenamiento, sin volumen de datos que lo justifique (un hogar, decenas de productos, una compra semanal). Un modelo entrenado sobreajustaría con esa cantidad de observaciones. Lo que se construyó es estadística simple y explicable — promedios, conteos, umbrales mínimos de evidencia — en la misma línea que `product_replenishment` (Fase 4/8), no un modelo "de caja negra". Cada sugerencia se puede justificar en una frase concreta al usuario.

**Qué se construyó** (`supabase/migrations/20260912013000_fase10_sugerencias_inteligentes.sql` — el nombre de archivo quedó con el número de fase equivocado por un desfasaje de numeración, no afecta nada funcional):
- Vista `product_suggestions`: tres reglas independientes (UNION ALL), cada una con un piso mínimo de evidencia antes de sugerir nada:
  - **`ciclo_de_compra`**: calcula el intervalo real entre compras (`stock_movements` con `delta>0`, vía `LAG()`) de los últimos 180 días. Necesita al menos 2 intervalos (3 compras). Si `restock_cycle_days` no está configurado, o difiere del promedio real por ≥30% (mínimo 3 días), sugiere el promedio redondeado.
  - **`umbral_manual`**: reusa el cálculo de `avg_daily_consumption` ya existente en `product_replenishment` (≥2 bajas de stock en 90 días). Sugiere `low_stock_threshold = ceil(consumo_diario × 3)` — mismo colchón de 3 días que ya usa la predicción automática — como respaldo para cuando el consumo deja de registrarse a tiempo.
  - **`archivar`**: sin stock y sin ninguna entrada real hace ≥120 días, o cargado al catálogo hace ≥60 días sin haberse comprado nunca. Señal deliberadamente conservadora en el número de días — es solo una sugerencia descartable, nunca un archivado automático, así que un falso positivo ocasional (ej. un producto de compra anual) cuesta un toque en "Descartar", no una pérdida de datos.
- Tabla `product_suggestion_dismissals`: al descartar, guarda el valor descartado (o, para `archivar`, la fecha). La sugerencia no vuelve a insistir con el **mismo** valor, pero si la evidencia cambia (nuevo promedio, nueva compra) puede reaparecer con un valor distinto. No hace falta un job que expire descartes: se resuelven solos.
- RPCs `apply_product_suggestion` / `dismiss_product_suggestion` (`security definer`, mismo patrón de `private.is_household_member` que el resto de RPCs desde Fase 1). Aplicar pisa el valor real del producto (o lo archiva) — al hacerlo, la sugerencia deja de cumplir su propia condición y desaparece sola de la vista, sin necesidad de marcarla "aplicada" aparte.
- Frontend: tercera pestaña "Sugerencias" en Reportes (junto a Resumen/Historial), con badge de cantidad. Tarjetas agrupadas por tipo, cada una con el motivo en texto plano y botones Aplicar/Descartar.

**Verificado con datos reales, no solo revisado a ojo**: el hogar real tiene apenas ~4 horas de antigüedad (146 movimientos de `initial_load` de ayer, 2 consumos) — insuficiente evidencia real para que dispare ninguna sugerencia todavía, y así lo confirma la vista en producción (0 filas). Para validar que la lógica en sí funciona, se probaron las 3 reglas con datos sintéticos insertados **dentro de una transacción con `rollback`** (nunca se persistió nada de prueba): ciclo de compra con 3 compras espaciadas 45 días detectó correctamente el desvío contra un ciclo configurado en 28 y sugirió 45; umbral con 3 consumos reales sugirió correctamente subir el umbral; archivado con una compra de hace 130 días y sin stock lo marcó correctamente, y dejó de marcarlo al restaurar el movimiento reciente real que sí tenía ese producto (evitando así un falso positivo confirmado en la primera prueba, antes de corregir el setup).

**Fuera de alcance por ahora**: no hay forma de "desarchivar" un producto desde la UI (ya era una limitación preexistente de Fase 7, no nueva de esta fase) — si alguien aplica "Archivar" por error, el dato no se pierde (`products.archived` es soft-delete, el historial de compras se conserva), pero revertirlo hoy requiere una consulta directa a la base. Queda como pendiente si se nota que hace falta.

Verificado con `mcp__Supabase__get_advisors` (sin hallazgos de seguridad nuevos respecto al patrón ya existente en el resto de RPCs), `npm run build` y `npm run lint` limpios.

---

## Fase 12: pantalla en blanco/negro al abrir la app (causa raíz real, no solo síntoma)

El usuario pidió revisar todas las pantallas donde la app se puede quedar en blanco o negro mientras carga, notando que se ve más al abrir la app por primera vez. Esto ya se había tocado en Fase 10 (auditoría de UX), pero ahí se resolvió el síntoma visible en Lista/Comprar (demasiadas sugerencias) y en Stock (ruido visual) — no se había llegado a la causa raíz de la pantalla en blanco/negro en sí, que quedó documentada como intentada y descartada: se había creado `(app)/loading.tsx` y se borró al confirmar (leyendo la documentación de Next.js en `node_modules/next/dist/docs/`) que un `loading.tsx` **nunca** envuelve al `layout.tsx` de su propia carpeta — solo envuelve `page.tsx` y los `layout.tsx` **anidados por debajo**. El layout de `(app)` hace su propio chequeo de sesión/hogar (`getActiveHousehold()`) antes de renderizar el header, el nav y cualquier contenido — sin Cache Components (este proyecto no lo tiene activado), "la navegación se bloquea hasta que el layout termina de renderizar" (cita textual de la documentación), y sin ningún `<Suspense>` arriba cubriendo ese bloqueo, el body queda vacío (blanco o negro, según `prefers-color-scheme`, ya que `body` en `globals.css` ya usa una variable de tema) sin ningún indicio de que algo está pasando.

**La causa raíz real, entonces, no es "falta un loading.tsx" sino "el loading.tsx estaba en el nivel equivocado".** La misma documentación de Next.js da la solución explícita: mover el fetch a `page.js`, o darle al layout su propio `<Suspense>` — pero acá el fetch en el layout no es incidental, es el guard de autenticación/hogar que protege a TODAS las rutas de `(app)/*`, así que moverlo rompería el propósito del layout compartido. La alternativa correcta (la misma doc lo confirma con la frase "loading.js wraps... nested layout.js files") es poner el `loading.tsx` un nivel **arriba** de `(app)/`, en la raíz (`src/app/loading.tsx`), que sí es el ancestro correcto para envolver a `(app)/layout.tsx` como "layout anidado". Los grupos de rutas como `(app)` solo afectan la URL (confirmado también en `node_modules/next/dist/docs/.../route-groups.md`: "should not be included in the route's URL path"), no la jerarquía real de componentes — así que `(app)/layout.tsx` sigue siendo un layout anidado normal a todos los efectos de `loading.tsx`.

**Cambio único**: `src/app/loading.tsx` (nuevo). Cubre, en un solo lugar, las 4 pantallas que hacían un chequeo de sesión/hogar bloqueante sin ningún `<Suspense>` propio: `/` (redirección inicial), `(app)/layout.tsx` (entrada a Lista/Stock/Comprar/Reportes/Ajustes — el caso que más se nota, porque es la puerta de entrada a toda la app), `/onboarding` y `/join/[codigo]`. `/login` no lo necesita: ya tenía su propio shell estático instantáneo desde una ronda anterior. Contenido: el mismo ícono de marca que ya se usa en `/login` (con un `animate-pulse` para que se note que es un estado de carga y no un ícono estático) + texto "Cargando…" — nada nuevo visualmente, mismo lenguaje ya establecido, para que la transición pantalla nativa del SO → este splash → contenido real se sienta continua.

**Por qué no se armaron splashes específicos por ruta** (JUICIO): este único `loading.tsx` cubre destinos distintos (login, onboarding, join, o la app entera) sin saber de antemano a cuál se llega — un mensaje específico tipo "Preparando tu hogar…" sería incorrecto en 3 de los 4 casos. Se prefirió un splash genérico y honesto ("Cargando…") antes que un mensaje que a veces mienta.

**Limitación declarada, no resuelta por este cambio**: en un cold start real de un servidor sin tráfico (ej. una función serverless de Vercel recién despertada), puede haber un lapso antes de que lleguen los primeros bytes de la respuesta donde el navegador no muestra nada propio de la app (todavía no llegó ni el HTML) — eso es tiempo de infraestructura, no placeholder de UI, y ningún `loading.tsx` lo cubre. Este cambio elimina la parte controlable desde la app (el tiempo de espera de la consulta a Supabase una vez que el HTML empezó a llegar), que es la mayoría del caso reportado.

**Verificado en runtime, sin tocar datos reales** (se evitó a propósito crear una cuenta de prueba: esta app usa el proyecto de Supabase real de la familia, con compras y hogar ya cargados, y sumarle un usuario/hogar de basura para poder iniciar sesión y ver la pantalla no valía la pena). En cambio, se levantó el servidor de desarrollo local y se hicieron pedidos anónimos de solo lectura (sin sesión, sin escribir nada) a `/` y a `/lista`: en ambos casos el HTML devuelto por el servidor contiene el texto "Cargando…" del nuevo splash, streameado *antes* de que se resuelva el redirect a `/login` — confirmación real de que el `<Suspense>` está funcionando como predice la documentación, no solo una lectura teórica de los docs.

---

## Corrección: bugs reales en sugerencias inteligentes (revisión con rol de datos/seguridad)

Antes de dar la Fase 11 por cerrada del todo, se había lanzado en paralelo una revisión con perspectiva de ingeniería de datos/ML aplicado y de seguridad sobre la migración y el frontend recién construidos. Encontró 2 bugs reales de lógica (no hipotéticos) y 2 gaps reales de UX, más un par de mejoras menores de defensa en profundidad. Se corrigieron todos antes de considerar la feature terminada:

**Bug 1 (lógica, alto impacto)**: en `ciclo_de_compra`, el filtro de "últimos 180 días" solo se aplicaba al extremo más nuevo de cada intervalo entre compras, no al más viejo — un hueco de compra de hace 300 días podía colarse como "intervalo real" si el evento más reciente caía dentro de la ventana. Además, no se filtraba por `reason`, así que el movimiento sintético `initial_load` de la carga inicial (Fase 6, una unidad "como si se hubiera comprado hoy" el día que se dio de alta el hogar) contaba como una compra real y anclaba artificialmente los intervalos calculados al día de alta del hogar. **Confirmado con un caso concreto** (revertido con `rollback`, sin persistir nada): con compras reales a -300, -170, -20 y -1 días más un `initial_load` a -365, el cálculo anterior hubiera mezclado el hueco de 300 días con el synthetic; corregido, se filtra `reason = 'purchase'` desde la base y la ventana de 180 días se exige en ambos extremos del intervalo — solo cuentan los intervalos 150 y 19 días (mediana 84, ya no hay dato sintético de por medio). Se cambió también de promedio a mediana para no dejar que un solo intervalo atípico domine con pocos datos.

**Bug 2 (lógica, alto impacto)**: en `umbral_manual`, el piso de "al menos 2 bajas de stock" no exigía ninguna dispersión temporal — dos consumos registrados el mismo día (denominador de "días desde el primer consumo" con un piso de 1 día) inflaban la tasa diaria estimada y, a diferencia de `product_replenishment` (Fase 4/8, donde la misma fórmula alimenta solo un flag efímero), acá el resultado se escribe directo en `products.low_stock_threshold` si se acepta — un umbral inflado por un caso de borde persiste hasta que alguien lo note y lo corrija a mano. **Confirmado con un caso concreto**: 2 consumos el mismo día ya no genera ninguna sugerencia (antes hubiera sugerido un umbral igual al stock comprado, prácticamente inútil); con los mismos consumos separados por varios días sí sugiere correctamente (se probó con "Agua mineral": current=1, sugerido=2, con la razón "~0.50 bidón por día"). Se exige ahora que los consumos abarquen al menos 3 días distintos antes de confiar en la tasa.

**Gap de UX 1**: "Archivar" en el panel de sugerencias aplicaba con un solo toque, a diferencia de Stock (que ya tiene una confirmación de dos pasos para la misma acción desde Fase 7). Se agregó el mismo patrón de confirmación inline, con el mismo texto tranquilizador ("se puede reactivar después desde Ajustes" — cierto, ya existe esa tarjeta desde Fase 7).

**Gap de UX 2**: un error al aplicar o descartar una sugerencia fallaba en silencio (sin ningún mensaje), y el badge de cantidad en la pestaña "Sugerencias" (calculado en el server, en `reportes/page.tsx`) quedaba desactualizado después de aplicar/descartar porque nada disparaba una revalidación. Se agregó un mensaje de error visible por tarjeta y un `router.refresh()` después de cada acción exitosa.

**Menores (defensa en profundidad, sin impacto práctico confirmado)**: se sacó un índice redundante (`product_suggestion_dismissals_product_id_idx`, ya cubierto por el índice implícito de la unique constraint), se ajustó el umbral de "cuándo volver a insistir" en `umbral_manual` de una diferencia absoluta de 1 a un 20% relativo (para no reaparecer por una diferencia de redondeo), y se agregó una validación cruzada extra en la policy de `product_suggestion_dismissals` (que un `product_id` insertado realmente pertenezca al `household_id` de la fila) — el único camino de escritura ya es el RPC, que ya lo garantiza, así que esto es un cinturón extra, no el arreglo de un agujero explotable.

Migración: `supabase/migrations/20260912020500_fase12_fix_sugerencias_inteligentes.sql`. Verificado con `mcp__Supabase__get_advisors` (mismo patrón preexistente, sin hallazgos nuevos), los 2 bugs reproducidos y corregidos con datos sintéticos dentro de transacciones con `rollback` (nunca se persistió nada de prueba), y `npm run build`/`npm run lint` limpios en el frontend.

---

## Fase 13: ofrecer agregar la app a la pantalla de inicio

El usuario pidió que la app misma le ofrezca a quien no la tiene agregada a su pantalla de inicio hacerlo directamente, con roles de Android e iOS. Se verificó con búsqueda web (información que cambia con el tiempo, no se asumió de memoria) antes de programar, porque el comportamiento real de cada plataforma es completamente distinto y determina qué es técnicamente posible:

**HECHO (confirmado con fuentes actuales)**:
- Android/Chrome expone un evento programático real, `beforeinstallprompt`: se puede interceptar (`preventDefault()`), guardar, y disparar después con un botón propio (`.prompt()` + `.userChoice`), más un evento `appinstalled` para saber cuándo ya se instaló.
- iOS Safari **no tiene ningún equivalente** — Apple no lo implementa, y no hay señal de que lo vaya a hacer (hilos abiertos en sus propios foros de developer sin respuesta). La única forma de instalar en iOS es manual, desde el botón de Compartir → "Agregar a inicio"; lo único que una web app puede hacer es mostrar esas instrucciones e detectar si ya está instalada vía `navigator.standalone`.
- **Hallazgo que cambió la implementación**: aunque Chrome ya no exige un service worker para que la PWA sea "instalable" en general (relajado desde Chrome 108/112), el algoritmo que decide si **muestra** el prompt de `beforeinstallprompt` todavía requiere uno con un fetch handler real — y explícitamente no alcanza con un handler vacío tipo placeholder. Esta app no tenía ningún service worker (`grep` en el repo no encontró ninguno) — sin agregar uno, el pedido simplemente no iba a funcionar en Android por más botón e interceptor de evento que se programara.

**Qué se construyó**:
- `public/sw.js` (nuevo): service worker mínimo pero real, no un placeholder. A propósito **no cachea nada dinámico** (HTML de páginas, llamadas a Supabase) — esta app siempre muestra datos personales del hogar renderizados por request, y servir una versión vieja desde caché podría mostrar datos de otro momento sin que nadie lo note. Solo cachea los 5 activos verdaderamente estáticos que ya usa el manifest (íconos, el manifest mismo) con estrategia cache-first; cualquier otro pedido (RPCs de Supabase, POSTs, navegación) pasa exactamente igual que sin service worker, sin `respondWith()` de por medio.
- `src/app/(app)/install-prompt.tsx` (nuevo): un solo componente con dos ramas de UI completamente distintas según la plataforma (no una sola con una bandera, porque no comparten nada):
  - **Android**: escucha `beforeinstallprompt`, muestra una tarjeta con botón "Agregar" que dispara el prompt nativo del navegador.
  - **iOS**: muestra instrucciones ("Tocá compartir ⬆️ y elegí Agregar a inicio") — no hay otra opción posible en esta plataforma.
  - **Navegador embebido de otra app** (WhatsApp/Instagram/Facebook/Line vía user agent — relevante para esta app en particular porque ya existe una invitación por WhatsApp desde Fase 9, así que es un camino de entrada real, no hipotético): ninguna de las dos rutas anteriores funciona ahí, así que se muestra un mensaje distinto pidiendo abrir el link en el navegador real.
  - Nunca se muestra si ya está instalada (`display-mode: standalone` o `navigator.standalone`), y se puede descartar ("Ahora no") por 14 días sin perder la posibilidad de que vuelva a aparecer más adelante — mismo criterio de "no ser naggy" ya aplicado en la Fase 10 (auditoría de UX).
- Montado en `(app)/layout.tsx`, visible en todas las pantallas de la app ya autenticada (no en login/onboarding, donde mostrarlo sería prematuro).

**Limitación declarada (SUPUESTO, no hecho verificado)**: la detección de "navegador embebido" es una heurística por user agent, no 100% confiable — en particular, el navegador embebido de WhatsApp en **iOS** no tiene un token identificable conocido con confianza, así que ese caso puntual puede no detectarse y mostrar igual las instrucciones de iOS, que ahí no van a funcionar. Cubre los casos más comunes (Facebook, Instagram, WebViews de Android genéricos), no todos. En Android, WhatsApp abre los links en Chrome Custom Tabs (no un WebView embebido) en versiones recientes, así que ese caso específico ya funciona bien sin necesitar detectarlo como "bloqueado".

**No verificado con un dispositivo real** (JUICIO, declarado a propósito, mismo motivo que en Fase 12): no hay forma de instalar una PWA de prueba sin usar cuentas/dispositivos reales, y no correspondía sumar una cuenta de prueba a la base de datos real de la familia solo para esto. Se verificó lo que sí se pudo sin tocar datos: `public/sw.js` se sirve con el content-type correcto (`application/javascript`) desde el servidor de desarrollo, y `npm run build`/`npm run lint` compilan y tipan limpio (incluyendo una regla nueva de eslint, `react-hooks/set-state-in-effect`, resuelta con una excepción puntual y justificada en el código — es un caso legítimo: no existe ningún valor correcto de "¿qué plataforma es esta?" que el servidor pueda renderizar, al depender de `navigator`/`window`). Si en el uso real el prompt de Android no aparece, el sospechoso número uno es el heurístico de "engagement" de Chrome (exige al menos un toque en la página y ~30 segundos de uso antes de disparar el evento por primera vez) — no sería una señal de que el código esté mal.

---

## Fase 14: la pantalla seguía "colgada" varios segundos al abrir por primera vez (causa raíz de fondo, no el síntoma)

El usuario reportó que, incluso después del splash de Fase 12, la app seguía tardando varios segundos en mostrar algo real al abrirla por primera vez. Correcto: Fase 12 resolvió que hubiera ALGO visible de inmediato (dejó de verse "colgada" en el sentido de pantalla vacía), pero no tocó **cuánto tardaba en resolverse** lo que hay detrás de ese splash — que es lo que ahora se atacó.

**Diagnóstico (INFERENCIA a partir de leer el código de punta a punta, no un profiler real — no hay forma de perfilar producción sin acceso a Vercel)**: abrir la PWA instalada entra por `start_url` (`"/"` hasta ahora). Esa página no hace más que decidir a dónde mandar según sesión/hogar (`getActiveHousehold()`) y redirigir. El problema: el destino real (`/lista`, vía el layout de `(app)/`) vuelve a hacer exactamente el mismo chequeo de sesión/hogar desde cero, porque un `redirect()` de servidor es una navegación de browser nueva, no una continuación del mismo request — así que cada apertura de la app pagaba el costo de ese chequeo **dos veces** (una en `/`, otra en `/lista`) antes de mostrar cualquier dato real. Sumado a que cada chequeo en sí mismo hacía dos llamadas de red secuenciales (no paralelas) — `auth.getUser()` primero, y solo después, ya con ese resultado, la consulta a `household_members` — el camino completo podía acumular fácilmente 6-7 idas y vueltas de red en serie antes del primer contenido de verdad. Eso sí explica "varios segundos", sobre todo con conexiones más lentas o el hogar recién arrancando desde frío.

**Dos cambios, cada uno ataca una mitad del problema**:

1. **`src/app/manifest.ts`**: `start_url` pasa de `"/"` a `"/lista"`. Para quien ya tiene la app instalada y usada a diario (el caso normal, todos los días — no el de alguien sin cuenta todavía), esto elimina por completo el primer salto: entra directo al layout real, que si hace falta igual redirige a `/login` u `/onboarding` desde ahí mismo, sin el paso intermedio. Se agregó también `scope: "/"` explícito — confirmado con búsqueda web que, sin `scope` explícito, el navegador lo infiere del `start_url` quitándole el "nombre de archivo", y con un valor como `/lista` (sin barra final, sin extensión) esa inferencia es ambigua entre navegadores; sin fijarlo a mano, Stock/Comprar/Reportes podrían haber quedado fuera del scope de la app instalada y abrirse en el navegador normal en vez de en la ventana standalone — una regresión bastante peor que la lentitud que se estaba arreglando.

2. **Nueva vista `my_membership`** (`supabase/migrations/20260912022500_fase14_perf_my_membership_view.sql`) + reescritura de `src/lib/household.ts`: la consulta a `household_members` necesitaba el `id` del usuario para armar su filtro (`eq("user_id", user.id)`), y por eso tenía que esperar a que `auth.getUser()` resolviera primero — aunque Postgres YA sabe quién es el usuario autenticado en cada request via `auth.uid()`, sin que el cliente se lo tenga que pasar. La vista nueva mueve ese filtro adentro de la base (`where user_id = auth.uid()`), así que la consulta ya no depende de nada que el cliente le pase, y ahora `auth.getUser()` y la consulta a `my_membership` se disparan juntas con `Promise.all` en vez de una detrás de la otra. Verificado con datos reales (sin tocar nada — solo lectura, y simulando el JWT de un usuario real con `set local role authenticated` + `set local request.jwt.claims` dentro de una transacción): la vista devuelve exactamente la fila del usuario correspondiente, y nada para un usuario que no es miembro de ningún hogar.

**Por qué no se tocó el middleware** (JUICIO): la alternativa más agresiva — que el middleware (que YA hace su propio `auth.getUser()` en cada request para refrescar cookies) le pase el resultado ya validado a los Server Components via un header, evitando que `getActiveHousehold()` tenga que llamar a `auth.getUser()` una segunda vez — se consideró y se descartó. Hubiera ahorrado una llamada más, pero requería tocar el código de refresco de cookies de Supabase (ya delicado, con su propio comentario de "no borrar" en el archivo), sin forma de probarlo contra una sesión real sin arriesgar accidentalmente romper el login de toda la familia. El cambio de la vista logra la mayor parte del beneficio (pasa de secuencial a paralelo) sin tocar ese código sensible — mejor relación riesgo/beneficio.

**Resultado esperado (INFERENCIA, no medido en producción)**: para alguien ya logueado con hogar, de ~6-7 idas y vueltas de red en serie antes del primer contenido real, quedan ~3 (una del middleware, una del layout ahora en paralelo, una de la propia página). No se pudo medir en producción real (no hay acceso a Vercel ni corresponde crear una cuenta de prueba en la base real para esto, mismo criterio que rondas anteriores) — se verificó en cambio: la vista devuelve los datos correctos con un JWT simulado, `npm run build`/`npm run lint` limpios, y una corrida local confirmando que `/lista` sin sesión sigue redirigiendo correctamente a `/login` (0.18s en request ya compilado, sin overhead de compilación) y que el manifest ya sirve `start_url: "/lista"` y `scope: "/"`.

**Limitación declarada**: como ya se señaló en Fase 12, ningún cambio de este tipo puede eliminar la latencia de infraestructura pura (cold start de una función serverless de Vercel que no recibió tráfico en un rato) — eso queda fuera del alcance de cualquier optimización a nivel de aplicación.

---

## Fase 15: pantalla de bienvenida rearmada de cero (no otra optimización)

Después de Fase 14 el usuario siguió notando lentitud y pidió explícitamente lo contrario a seguir optimizando: rearmar de cero la pantalla de bienvenida, tanto para quien no tiene sesión como para quien sí. Roles convocados: UX/UI (qué mostrar y a quién), arquitectura de frontend (cómo estructurarlo para que lo importante no dependa de nada lento), y crítico (¿esto realmente ataca la causa, o es una curita más?).

**Rol crítico, primero**: ¿por qué seguía sintiéndose lento después de reducir los viajes de red en Fase 14? INFERENCIA razonable: reducir de 6-7 a ~3 viajes de red en serie es real, pero **la arquitectura seguía siendo "no mostrar nada hasta que el servidor termine de decidir a dónde mandarte"** — cualquier cantidad de optimización dentro de ese modelo tiene un piso que no puede bajar de "al menos una ida y vuelta a Supabase antes de la primera píxel útil". Ahí es donde "en vez de optimizar, rearmá" tiene razón: el problema no era (solo) cuántos viajes de red hacía `/`, era que `/` **no existía como pantalla real** — era pura plomería invisible (`redirect()`) sin nada que mostrar mientras tanto, ni siquiera para alguien sin cuenta (que ni sesión tiene que validar, y aun así esperaba lo mismo).

**Qué se rearmó**:
- **`src/app/page.tsx`**: antes hacía `await getActiveHousehold()` y redirigía sin mostrar nada propio. Ahora es una función **no async**, sin ningún `await` en el nivel superior — devuelve directo el ícono de marca + "ListaSuper" + la bajada, contenido 100% estático que no depende de Supabase para nada. Eso se pinta tan rápido como el navegador reciba el HTML, sea cual sea la latencia de la base ese día.
- **`src/app/welcome-status.tsx`** (nuevo): la única parte que sí necesita saber quién sos vive acá, separada, envuelta en su propio `<Suspense>` desde `page.tsx` — así nunca bloquea el ícono/título de arriba. Tres estados, cada uno con una acción explícita (nunca un redirect invisible):
  - Sin sesión: "Iniciar sesión" / "Crear cuenta" (van a `/login` y `/login?mode=signup`, mismo contrato de query params que ya usa `login-form.tsx`).
  - Con sesión, sin hogar todavía: "Ya iniciaste sesión. Falta terminar de armar tu hogar." + botón a `/onboarding`.
  - Con sesión y hogar: "¡Hola de nuevo! Seguís en **{nombre del hogar}**." + botón "Entrar a mi lista" a `/lista`.
- `WelcomeStatusSkeleton`: mismo alto/ancho que los botones reales (dos barras de `animate-pulse`), para que no haya salto de layout cuando el contenido de verdad los reemplaza.

**Decisión de diseño deliberada (JUICIO, con roles de UX)**: ninguno de los tres estados redirige solo — todos requieren un toque explícito. Antes, alguien ya logueado con hogar nunca veía nada de esto (redirect invisible); ahora ve un "hola de nuevo" real antes de decidir entrar. Se evaluó automatizar ese último paso (auto-avanzar a `/lista` sin que haga falta tocar nada) y se descartó: el `start_url` de la PWA instalada ya apunta directo a `/lista` desde Fase 14, así que el uso diario real (abrir el ícono del teléfono) ni siquiera pasa por esta pantalla — a quien SÍ llega acá (por un link, por el navegador, por probar el dominio a mano) mostrarle "hola de nuevo" con un botón en vez de mandarlo de una es más honesto y da una sensación real de "esto respondió", no de limbo.

**Efecto colateral corregido**: `login-form.tsx` mandaba de vuelta a `/` (`router.push(next || "/")`) después de un login o signup exitoso, confiando en que `/` iba a redirigir sola hacia `/lista`. Con `/` ahora siendo una pantalla real (no un redirector), eso hubiera agregado un toque de más después de cada login. Se corrigió a `router.push(next || "/lista")` en los dos lugares donde aparecía — el flujo de login queda igual de directo que antes, sin el toque extra.

**Por qué la ruta sigue marcada `ƒ` (dinámica) y no `○` (estática) en el build**: este proyecto no tiene activado Partial Prerendering / Cache Components (confirmado ya en rondas anteriores, ver AGENTS.md), que es lo que permitiría que Next prerenderice el cascarón estático en build time y solo la parte dinámica se resuelva por request. Sin eso, Next clasifica la ruta entera como dinámica apenas hay CUALQUIER dependencia de Supabase en el árbol, aunque esté en un componente hijo envuelto en Suspense. Igual sirve: el streaming SSR (mismo mecanismo verificado en Fase 12) manda el cascarón estático en el primer chunk de la respuesta sin esperar a `<WelcomeStatus>`, así que el efecto práctico — contenido real e inmediato, sin esperar a Supabase — se logra iguial, solo que resuelto en cada request en vez de una sola vez en build. Activar Cache Components sería la mejora natural que sigue si hiciera falta más, pero es un cambio de configuración más grande y no lo que se pidió esta ronda.

**Verificado**: `npm run build`/`npm run lint` limpios, y una corrida local (solo lectura, sin sesión) confirmando que el HTML devuelto por `/` ya contiene el ícono, "ListaSuper", la bajada y los botones "Iniciar sesión"/"Crear cuenta" — 0.12s en un pedido ya compilado, contra los 3.5s del primer pedido (puro overhead de compilación de `next dev`, no representativo de producción). El estado "con sesión y hogar" no se pudo probar con una sesión real por el mismo motivo de siempre (no corresponde crear una cuenta de prueba en la base real de la familia) — quedó verificado por lectura de código, no en vivo.

---

## Fase 16: unificar por día el Historial de compras

El usuario pidió que, si carga compras "de a tandas" el mismo día, Historial (Reportes) muestre una sola fila por día en vez de una por cada tanda cargada.

**Hecho confirmado con datos reales antes de programar** (no una suposición): el hogar real tiene ahora mismo 4 filas en `purchases`, las 4 con timestamp UTC del 12/09 en la madrugada — pero convertidas a hora de Argentina (UTC-3), las 4 caen en realidad el 11/09 a la noche. Es exactamente el caso que describe el pedido (varias tandas cargadas el mismo día real), y de paso confirma por qué agrupar tiene que hacerse en huso horario de Argentina y no en UTC: agrupar por día UTC ingenuamente hubiera dado la misma respuesta en este caso puntual por casualidad (las 4 caen del lado UTC del 12/09), pero en general una compra cargada a la noche cerca de la medianoche UTC (21hs Argentina) partiría mal el día si no se fuerza la zona horaria.

**Cambio**: `purchase-history.tsx` agrupa las compras por día calendario en `America/Argentina/Buenos_Aires` (clave de agrupación con `Intl.DateTimeFormat("en-CA", ...)`, que da directo el formato AAAA-MM-DD) antes de renderizar. Cada fila del historial pasa a ser un día, con:
- Fecha del día, supermercado(s) (uno solo si todas las tandas fueron al mismo lugar, la lista separada por coma si no, "Sin especificar" si ninguna tenía uno cargado), cantidad total de productos, y el total sumado (solo si al menos una tanda tenía precio cargado).
- Si hubo más de una tanda ese día, la fila también aclara "(N compras)" junto a la cantidad de productos — transparente sobre que es un agregado, sin volver a mostrar una fila por tanda.
- Al expandir: si fue una sola tanda ese día, se ve exactamente igual que antes (lista de productos) — cero cambio visual para el caso más común. Si hubo varias, cada tanda aparece como su propia mini-sección (hora, supermercado, subtotal) con sus productos debajo — se decidió NO mezclar los ítems de distintas tandas en una sola lista plana, para no confundir precios/cantidades de un mismo producto comprado en momentos distintos del día.

**Verificado con los datos reales del hogar** (simulado en un script aparte, solo lectura, sin tocar la base): las 4 compras reales agrupan correctamente en un solo día (`2026-09-11` en hora Argentina), confirmando que el caso real que motivó el pedido queda resuelto. `npm run build`/`npm run lint` limpios. No hizo falta tocar el esquema ni la consulta de `reportes/page.tsx` (el límite de 30 filas sigue siendo sobre compras individuales, no sobre días — de sobra para la ventana que se muestra).

---

## Fase 17: control de compras duplicadas

El usuario pidió una instancia de control para cuando un mismo usuario, o dos usuarios del mismo hogar, cargan la misma compra por error.

**Qué ya existía y qué faltaba**: el botón "Confirmar compra" ya se deshabilita mientras la petición está en vuelo (`submitting`), así que un doble toque literal en el mismo instante ya estaba cubierto. Lo que NO cubría: (a) un reintento después de un error (el botón se reactiva), y sobre todo (b) el caso que el pedido menciona explícitamente — dos personas del mismo hogar, cada una en su propio teléfono, cargando la misma compra sin saberlo. Ese caso no tiene forma de resolverse en el estado de React de una sola pestaña; la única verificación confiable tiene que vivir en el servidor.

**Diseño (JUICIO, roles de backend/seguridad y UX)**: no un bloqueo duro (podría impedir una compra genuina — dos idas al súper el mismo día con algún producto en común), sino un aviso que pide confirmar. Regla: si en los últimos **20 minutos** ya se registró, en el mismo hogar, una compra que comparte **al menos un producto** con la que se está por cargar, `record_purchase` (la RPC que ya centraliza todo el registro de compras desde Fase 1) tira una excepción distinguible (`possible_duplicate`, con el detalle de "hace cuántos minutos" en el `DETAIL` de Postgres) en vez de guardar derecho. El cliente la atrapa, muestra el aviso con dos botones ("Confirmar de todos modos" / "Revisar"), y si la persona confirma reintenta la misma llamada con un parámetro nuevo `p_confirm_duplicate = true` que salta el chequeo. Es deliberadamente simple (una regla de tiempo + superposición de productos), no un modelo de detección de fraude — para el tamaño de este hogar, sobra.

**Cambios**:
- `record_purchase` (RPC): nuevo parámetro `p_confirm_duplicate boolean default false`. Como agregar un parámetro cambia la firma de la función, hizo falta un `drop function` explícito de la versión de 6 parámetros antes de crear la de 7 — si no, quedaban dos versiones coexistiendo (una con el chequeo, otra sin) y cuál se ejecuta depende de qué firma resuelva PostgREST, un estado confuso a propósito evitado.
- `comprar-client.tsx`: `handleSubmit` ahora toma `confirmDuplicate` (default `false`); si la RPC devuelve el mensaje puntual `possible_duplicate`, se guarda el detalle en un estado nuevo (`duplicateWarning`) y se muestra una tarjeta ámbar (mismo tono ya usado en Vencimientos/RestockChips para "atención", distinto del rojo ya reservado para errores reales) con las dos opciones. El botón principal "Confirmar compra" se deshabilita mientras el aviso está visible, para no dejar dos caminos de acción activos a la vez.
- **Bug preexistente corregido de paso** (no introducido por esta fase, pero se volvía mucho más probable de disparar justo con este flujo nuevo): al cargar un súper nuevo escribiendo el nombre (no eligiendo uno ya existente), `handleSubmit` insertaba la fila en `stores` pero nunca actualizaba el estado `storeId` — un reintento (como el que ahora agrega "Confirmar de todos modos") hubiera insertado el mismo súper por segunda vez. Se agregó `setStoreId(store.id)` inmediatamente después de crearlo.

**Verificado con datos reales del hogar, sin persistir nada de prueba** (tres pruebas dentro de transacciones con `rollback`, simulando el JWT del usuario real con `set local role authenticated` + `set local request.jwt.claims`): (1) una compra con "Huevos" recién cargada + un segundo intento con "Huevos" sin confirmar → tira `possible_duplicate` correctamente; (2) el mismo caso con `p_confirm_duplicate = true` → inserta sin problema; (3) una compra con un producto totalmente distinto ("Cif crema") sin confirmar → nunca se bloquea. `mcp__Supabase__get_advisors` sin hallazgos nuevos, `npm run build`/`npm run lint` limpios.

**Limitación declarada**: la ventana de 20 minutos y "comparte al menos un producto" son un punto de partida razonable, no un valor validado con datos reales de falsos positivos/negativos (no hay historial de duplicados reales para calibrar contra). Si en el uso real resulta muy sensible (avisa de más) o muy laxo (dos compras genuinas casi seguidas no se avisan porque no comparten ningún producto), es un ajuste de un solo número en la migración, no un cambio de diseño.

---

## Fase 18: auditoría integral pre-publicación

El usuario pidió una auditoría integral de toda la app antes de publicarla, con roles de usuarios haciendo una compra de súper de punta a punta. Dado el alcance (toda la app, no un cambio puntual), se lanzaron 4 subagentes en paralelo (Claude Code con subagentes, modo del propio skill de Consejo), cada uno con un rol y una lente distinta, cada uno leyendo el código real de punta a punta y verificando contra la base de datos real con SELECTs de solo lectura:

- **Seguridad / RLS** (Opus — arquitectura y seguridad ameritan el modelo más capaz según el propio criterio de Consejo).
- **Recorrido de usuario de punta a punta** (Sonnet): invitación por WhatsApp → primera vez → armar lista → comprar en el súper → revisar stock/vencimientos/reportes en casa.
- **Confiabilidad / condiciones de carrera** (Sonnet): qué pasa con 2-3 personas del hogar usando la app a la vez, con mala señal, en el mismo momento.
- **Mobile / PWA** (Sonnet): todo lo construido en Fases 12-15 (splash, service worker, install prompt, paralelización de auth) revisado con ojo fresco, más accesibilidad y rendimiento percibido.

### Hallazgo más serio: escritura cross-tenant real en `record_purchase` y `adjust_stock`

**ALTO, CONFIRMADO** (rol de seguridad, verificado contra la base real). Ninguna de las dos funciones validaba que el `product_id` recibido perteneciera al `household_id` que sí se validaba. Al ser `SECURITY DEFINER` (corren con permisos del rol de migraciones, que tiene `rolbypassrls`), un miembro del hogar A podía mandar un `product_id` de OTRO hogar (B) a `/rest/v1/rpc/record_purchase` o `/rest/v1/rpc/adjust_stock` y la función lo insertaba igual — una escritura cross-tenant real, más una vía de lectura de un dato de B (`default_shelf_life_days`, reflejado en la fecha de vencimiento que A sí puede leer). Mitigante real: hace falta conocer el UUID del producto ajeno de antemano (no es enumerable por la API), y hoy hay un solo hogar activo — pero es del tipo de agujero que hay que cerrar antes de sumar más hogares, no después. Se corrigió agregando una validación explícita de pertenencia antes de cualquier insert en ambas funciones — **verificado con una prueba real** (creando un segundo hogar y un producto ajeno dentro de una transacción con `rollback`, nunca persistido): el intento de comprar/ajustar ese producto ajeno ahora se rechaza con un mensaje claro.

### Segundo hallazgo serio, y con ironía: el control de duplicados de la Fase 17 tenía su propia condición de carrera

**ALTO, CONFIRMADO** (rol de confiabilidad). El chequeo de "posible compra duplicada" agregado la ronda anterior hace un SELECT (¿hay una compra reciente con productos en común?) y después un INSERT, sin serializar los dos pasos — exactamente el escenario que la Fase 17 dice cubrir ("dos personas del hogar cargando casi al mismo tiempo") puede hacer que ambas llamadas pasen el SELECT antes de que cualquiera haga commit del INSERT, y las dos compras duplicadas se guardan igual. Se corrigió agregando `pg_advisory_xact_lock(hashtext(household_id))` justo antes del chequeo: serializa las llamadas de `record_purchase` para el MISMO hogar (sin afectar a otros hogares), cerrando la ventana de carrera. Para 2-3 compras por semana de una familia, el costo de contención es nulo.

### Otros hallazgos corregidos esta ronda

- **MEDIO** — `changeQuantity` en Lista (+/- de cantidad) calculaba un valor absoluto en el cliente y lo escribía tal cual: dos personas tocando +/- sobre el mismo ítem casi a la vez pueden pisarse el incremento (confirmado por el rol de confiabilidad). Se agregó `increment_list_item_quantity` (RPC nueva, delta atómico en la base, mismo patrón que ya usa `adjust_stock` para stock) — **verificado con una prueba real**: dos incrementos de +1 aplicados "a ciegas" (sin que el segundo sepa el resultado del primero) suman correctamente 2, no se pisan.
- **HECHO** (rol de recorrido de usuario) — Comprar creaba productos duplicados: a diferencia de Lista (que ya revisa si el nombre tecleado coincide con uno existente antes de crear uno nuevo), Comprar no tenía ese chequeo — escribir el nombre completo y confirmar (en vez de tocar la sugerencia del desplegable) fragmentaba stock e historial desde ese momento. Se agregó el mismo chequeo que ya usa Lista, más una protección extra para no agregar dos veces el mismo producto a la compra en curso.
- **HECHO** — no existía ningún `error.tsx` en toda la app: cualquier excepción no controlada (ej. `lista/page.tsx` tira un error explícito si falla crear la lista activa) dejaba a la persona en la pantalla genérica de Next, sin nav ni marca ni salida. Se agregó `src/app/error.tsx` (boundary a nivel raíz, cubre todo menos el layout raíz en sí, que no tiene ninguna lógica propia que pueda fallar). Nota de API: esta versión de Next usa `retry` como prop principal del error boundary, no `reset` — confirmado leyendo `node_modules/next/dist/docs/` antes de escribirlo, tal como exige AGENTS.md.
- **HECHO** — "Se venció, lo tiré" en Vencimientos era irreversible (descuenta stock real) y se disparaba con un solo toque, a diferencia de "archivar producto" (que sí pide confirmar) en el resto de la app; además, si el RPC fallaba, no había ningún aviso. Se agregó el mismo patrón de confirmación de dos pasos que ya usan Stock/Sugerencias, más un mensaje de error visible.
- **BAJO** — el input de código de invitación en Onboarding mostraba el texto en mayúsculas por CSS (`className="uppercase"`), pero el código real es case-sensitive y la comparación en `join_household_by_code` es exacta — alguien tipeándolo a mano podía ver todo en mayúsculas mientras mandaba minúsculas reales, y fallar sin motivo aparente. Se sacó el CSS engañoso (lo que se ve ahora es exactamente lo que se manda).
- **BAJO** — precios negativos se aceptaban sin validar, ni en cliente ni en servidor, rompiendo los totales de Reportes en silencio. Se agregó la validación en `record_purchase`.
- **BAJO** — `create_household` aceptaba un nombre vacío o solo espacios. Se agregó la validación.
- **BAJO** — `StockClient.adjust()` no revisaba si el RPC fallaba: la UI optimista (el número que ya se había actualizado en pantalla) quedaba desincronizada del backend sin ningún aviso. Se agregó revertir el cambio local si el RPC devuelve error.
- **BAJO** — `install-prompt.tsx` llamaba a `localStorage.getItem/setItem` sin protección: en Safari en modo privado más viejo, o con el storage lleno, eso podía tirar una excepción y romper el resto del componente (rol mobile/PWA). Se envolvió en `try/catch`.
- **BAJO, defensa en profundidad** — las 11 funciones `SECURITY DEFINER` (incluida la nueva `increment_list_item_quantity`) tenían `search_path = public` sin incluir `pg_temp` explícitamente. Postgres busca el esquema temporal PRIMERO para nombres de relación sin calificar, sin importar el search_path, salvo que se lo incluya en algún lugar de la lista (lo que anula esa prioridad implícita) — no explotable hoy vía PostgREST (no hay forma de crear una tabla temporal antes de llamar al RPC), pero es la forma correcta de blindarlo. Se agregó `pg_temp` al final en las 11.

### Hallazgos revisados y **deliberadamente no corregidos** esta ronda (JUICIO, con la razón de cada uno)

- **Reconexión de Realtime en Lista** (rol mobile/PWA): el canal se desuscribe bien al desmontar, pero no hay manejo explícito de `CHANNEL_ERROR`/reconexión ni un refetch automático al recuperar la señal — con mala señal en el súper (el caso de uso central de la app), la lista podría quedar desincronizada en silencio entre los celulares del hogar hasta que alguien la refresque a mano. No se corrigió porque es un cambio de UI más grande (estado de "desconectado" visible + lógica de refetch), y el peor caso es "se ve desactualizado", no pérdida de datos — se prioriza el resto de hallazgos, que sí tocan datos. Queda como el ítem más importante para una próxima ronda si se nota en el uso real.
- **RLS de `product_expirations`/`shopping_list_items`/`purchase_items`** (rol de seguridad): sus policies validan pertenencia al hogar a través de una tabla relacionada (la compra, la lista) pero no atan directamente el `product_id` de cada fila al hogar — es una capa de "defensa en profundidad" que falta, no un agujero de lectura confirmado (toda vista que expone nombres ya hace join con `products`, que sí filtra por RLS). Con la corrección de `record_purchase`/`adjust_stock` de arriba, la única vía real conocida para crear filas con este desajuste queda cerrada. Ampliar las policies a las 3 tablas es un cambio más grande (reescribir varias policies) para un riesgo ya mitigado en el punto de entrada.
- **Código de invitación sin expiración ni rotación** (rol de seguridad, bajo): un código filtrado da acceso permanente al hogar. Es una decisión de diseño ya tomada en Fase 9 (simplicidad para un hogar de pocas personas), no un bug — se deja como está.
- **Índices "no usados" que marca el advisor** (`product_suggestion_dismissals_household_id_idx`, `purchases_store_id_idx`): esperable en una base nueva con poco tráfico — son índices de cobertura de FK que SÍ se van a usar cuando crezca el volumen de datos; borrarlos sería contraproducente.

### Hallazgos ya revisados y confirmados como correctos (no son un hallazgo, quedan documentados porque se revisaron)

Las 8 vistas tienen `security_invoker = true` sin excepciones. Ningún secreto ni `service_role` key en el repo (`.env.local` gitignoreado, `.env.example` con valores vacíos). No hay inyección SQL posible en el parseo de `jsonb` de `record_purchase` (`%` de plpgsql no interpola en SQL). La atomicidad de `record_purchase` es correcta: ningún `exception when...then` traga un error a mitad del loop de ítems, así que Postgres hace rollback automático completo ante cualquier fallo. El caso "falla crear un súper nuevo, se reintenta" ya estaba bien resuelto desde Fase 17 (`unique(household_id, name)` + reuso del `store.id` guardado en estado). Ningún fetch del código tiene retry automático, y para este caso de uso (compras no idempotentes sin confirmar) es lo correcto: un reintento automático ciego podría disparar el aviso de duplicado o, peor, duplicar la compra. Todas las pantallas fijas/sticky aplican `env(safe-area-inset-*)` de forma consistente, los 5 `loading.tsx` de rutas reales usan el mismo skeleton compartido, no hay queries N+1 en ningún `page.tsx` server-side, y las keys de listas son estables en todos los componentes cliente revisados.

**Verificado**: cada corrección de base de datos se probó contra el esquema real dentro de transacciones con `rollback` (nunca se persistió nada de prueba) — incluyendo crear un segundo hogar simulado para probar el aislamiento cross-tenant, algo que no se había podido probar en rondas anteriores por no existir un segundo hogar real. `mcp__Supabase__get_advisors` sin hallazgos de seguridad nuevos tras los cambios. `npm run build`/`npm run lint` limpios en el frontend, incluida la firma correcta de `error.tsx` para esta versión de Next (confirmada contra la documentación empaquetada, no asumida de memoria).

---

## Unidad de Huevos: de "docena" a "pack de 6"

El usuario pidió que Huevos se pueda cargar en unidades de 6, porque en la práctica compran maples de 30 unidades y "docena" no encaja (30 no es múltiplo limpio de 12, obliga a cargar 2.5 docenas). Como el modelo de datos usa `unit_label` como texto libre sin tabla de conversión entre unidades (decisión consciente desde Fase 1 — ver "Modelo de datos" más arriba), el cambio es de contenido, no de esquema.

**Lo que se cambió, y por qué se tocaron números ya cargados y no solo la etiqueta**: cambiar `unit_label` de "docena" a "pack de 6" sin ajustar las cantidades ya cargadas hubiera dejado el stock existente mal representado — "2" bajo "docena" significa 24 huevos, pero "2" bajo "pack de 6" significa solo 12. Se convirtió con el factor real (1 docena = 2 packs de 6, docena/6=2) en las 4 tablas donde aparece una cantidad de Huevos: `products.unit_label`, los 2 `stock_movements` (inicial + la compra real ya cargada), el `purchase_items` de esa compra, y los 2 `product_expirations` activos. Resultado verificado contra `product_replenishment`: el stock sigue representando la misma cantidad física real (24 huevos), ahora expresada como "4 pack de 6" en vez de "2 docena". No había ningún precio cargado en esa compra (`unit_price`/`subtotal` nulos), así que no hizo falta ajustar nada de Reportes/gasto.

**No se tocó** `data/seed/productos_historico.csv` (el archivo de importación inicial, ya usado una sola vez en Fase 1 y no se vuelve a correr): sigue diciendo "docena" porque es un registro de lo que decía el histórico de Google Keep en su momento, no la definición vigente — declarado a propósito como una divergencia menor entre el archivo histórico y el catálogo real, no un error a corregir.

Cambio de dato puro, sin migración ni cambio de código (verificado que `unit_label` no está hardcodeado en ningún lugar del frontend, `grep` sobre `src/` no encontró ninguna referencia a "docena").

---

## Fase 19: reconexión de Realtime en Lista

Pendiente declarado en la Fase 18 (auditoría integral): el canal de Realtime de Lista se desuscribía bien al desmontar, pero no manejaba una caída de conexión real — con mala señal en el súper (el caso de uso central de la app), la lista podía quedar desincronizada en silencio entre los celulares del hogar. El usuario pidió retomarlo. Roles: ingeniería de tiempo real/sistemas distribuidos, UX (comunicar el estado de conexión sin generar ruido), confiabilidad (condiciones reales de wifi de supermercado).

**Investigación primero, no se asumió el comportamiento de la librería** (tal como exige AGENTS.md para código específico de una dependencia): se leyó el código fuente TypeScript empaquetado de `@supabase/realtime-js` (`node_modules/@supabase/realtime-js/src/RealtimeClient.ts` y `RealtimeChannel.ts`, la fuente canónica según el propio `AGENTS.md` de `@supabase/supabase-js`) en vez de asumir de memoria. Dos hechos verificados ahí, no supuestos:

1. **El socket YA reconecta solo**: tiene heartbeat + reconexión automática con backoff progresivo (`reconnectAfterMs`) — no hacía falta reimplementar la reconexión en sí, ya la maneja la librería.
2. **Pero "postgres_changes" no reproduce lo que se perdió durante el corte**: el "replay" de la librería solo aplica a mensajes de `broadcast` en canales privados, no a cambios de tabla. Un canal que se cae y se reconecta vuelve a recibir eventos NUEVOS desde ese momento, sin ponerse al día con lo que pasó mientras estuvo desconectado. Esto confirma que el hallazgo de la auditoría era real: sin algo adicional, dos personas con un corte de señal pueden terminar viendo listas distintas sin ningún aviso.

**Qué se construyó** en `shopping-list-client.tsx`:
- El callback de `.subscribe((status) => ...)` ahora seguido de sus 4 estados posibles (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`, confirmados en el enum `REALTIME_SUBSCRIBE_STATES` de la librería). Un estado nuevo, `realtimeStatus`, pasa a `"reconnecting"` ante cualquiera de los tres estados de caída.
- **Refetch al reconectar**: en vez de intentar reconciliar evento por evento lo que se perdió (imposible sin esos eventos), al volver a `SUBSCRIBED` **después de haber estado conectado antes** se vuelve a pedir toda la lista completa al servidor y se reemplaza el estado local — la forma simple y correcta de ponerse al día con un "no sé qué me perdí, pido todo de nuevo". La condición "después de haber estado conectado antes" evita un refetch redundante en el arranque normal de la página (la primera vez que el canal se suscribe, ya se acaba de cargar todo desde el servidor).
- **Aviso visible pero discreto** (rol UX, criterio de "no generar ruido" ya establecido en rondas anteriores): un texto chico con un punto pulsante ("Reconectando — lo que cambien otros en la lista puede tardar en verse") aparece SOLO cuando el canal está caído, y desaparece solo al reconectar. No aparece en el arranque normal de la página — sería ruido sin valor real, la conexión inicial tarda lo mismo que siempre tardó.

**Limitación declarada, no resuelta esta ronda**: no hay forma de simular un corte de wifi real de supermercado en este entorno (sin browser real ni control de red) para verificar el comportamiento end-to-end. Se verificó lo que sí se pudo sin eso: la lectura del código fuente de la librería (no una suposición), que los 4 estados usados existen tal cual en el enum de la librería instalada, y que `npm run build`/`npm run lint` compilan y tipan limpio.
