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

- **Fase 0 — Setup:** proyecto Supabase, Auth, repo Next.js + Vercel, RLS base, favicon/manifest (ya generados, ver abajo).
- **Fase 1 — MVP núcleo:** hogares e invitaciones, catálogo de productos (seed desde `data/seed/productos_historico.csv`), lista compartida en tiempo real, stock manual, registrar compra manual.
- **Fase 2 — Vencimientos y recordatorios:** fecha de vencimiento al registrar compra, job nocturno, notificaciones push + email, semáforo visual.
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
