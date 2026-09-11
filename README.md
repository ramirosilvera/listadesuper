# ListaSuper

La lista de súper que se acuerda de lo que se te vence y de lo que se te está por acabar, para que no tengas que hacerlo vos.

Web app para un hogar compartido: lista de compras en tiempo real, control de stock, recordatorios de reposición y de vencimientos, y registro de compras (manual o por foto de ticket) con informes gráficos de gasto/stock/vencimientos.

Ver el plan completo del proyecto en [`docs/plan.md`](docs/plan.md).

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Supabase](https://supabase.com) (Postgres + Auth + Storage + Realtime + Edge Functions)
- Deploy en [Vercel](https://vercel.com)

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar con las credenciales de tu proyecto Supabase
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

Las credenciales de Supabase están en el dashboard del proyecto: **Project Settings → API** (`Project URL` y `Publishable key`).

## Base de datos

Las migraciones viven en `supabase/migrations/` y se aplican en orden. Si tenés la [Supabase CLI](https://supabase.com/docs/guides/local-development) instalada:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

## Estructura

```
src/app/           # rutas de Next.js (App Router)
src/lib/supabase/  # clientes de Supabase (browser, server, middleware)
supabase/migrations/  # esquema de base de datos versionado
data/seed/          # catálogo de productos normalizado (histórico de compras)
docs/                # plan del proyecto, decisiones de diseño
public/icons/        # favicon / íconos de la PWA
```

## Estado

**Fase 0 (setup) completa.** Ver el roadmap completo de fases en [`docs/plan.md`](docs/plan.md).
