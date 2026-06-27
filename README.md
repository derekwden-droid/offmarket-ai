# OffMarket.AI

> AI-powered, hyper-niched real estate data scraping, skip tracing, and automated SMS/email lead qualification — wrapped in a high-fidelity, vivid dark-mode dashboard.

OffMarket.AI is a deal-intelligence platform for off-market property acquisition. It ingests scraped property records, resolves owner contact details via skip tracing, runs an AI outreach agent to qualify motivated sellers, and bundles curated lists into resellable packages.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Design system](#design-system)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Simulation vs. live data](#simulation-vs-live-data)
- [Roadmap](#roadmap)
- [Deployment](#deployment)
- [Security & compliance](#security--compliance)
- [License](#license)

---

## Features

- **Overview dashboard** — KPI cards (total properties, skip-trace hit rate, qualified leads, package revenue), a segmented lead-pipeline bar, and a recent-properties table. Reads live data from Postgres.
- **Data acquisition (Scrape)** — Filterable acquisition console with a live, streaming data terminal, dedup-aware ingestion counters, and a records table supporting per-row and bounded-concurrency batch skip tracing.
- **AI qualification (Outreach)** — A configurable outreach agent (tone, objectives, channels, temperature, persistence, daily cap, tokenized opening script) with a live, color-coded conversation monitor driven by a probabilistic state machine.
- **List packages** — Curated property bundles with pricing and property counts. Reads live data from Postgres.
- **Production-grade UX** — Class-based error boundaries, loading skeletons, toast notifications, keyboard focus rings, `prefers-reduced-motion` support, and full mobile responsiveness with a slide-in drawer.

## Tech stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript (strict, no `any`)
- **Styling:** Tailwind CSS v4 (CSS-first config) + inline styles for exact design-token fidelity
- **UI:** Lucide React icons, custom primitives (Button, Card, Badge, Field, Toast)
- **Database:** Supabase Postgres via Prisma ORM
- **Validation:** Zod (API route inputs and external provider responses)
- **Server state:** TanStack Query v5 (provider wired; ready for client data fetching)
- **Fonts:** Geist Sans / Geist Mono

## Design system

The "Vivid Dark Mode" palette is applied with literal values and inline styles so rendering never depends on Tailwind theme configuration.

| Token | Hex | Usage |
| --- | --- | --- |
| Background | `#0B0F19` | App canvas |
| Surface | `#111827` | Cards / panels |
| Border | `#1F2937` | Hairline separators |
| Emerald | `#10B981` / `#059669` | Financial / deal actions (with glow) |
| Cyber Blue | `#3B82F6` | AI / data / scraping surfaces |
| Amber | `#F59E0B` | Inbound / reply events |
| Rose | `#F43F5E` | Cold / negative outcomes |

## Project structure

```
offmarket-ai/
├── app/
│   ├── api/
│   │   ├── scrape/route.ts        # POST: batch ingestion + dedup + package connect
│   │   └── skip-trace/route.ts    # POST: bounded-concurrency owner enrichment
│   ├── dashboard/
│   │   ├── layout.tsx             # Sidebar + header shell (server)
│   │   ├── page.tsx               # Overview (KPIs, pipeline, recent)
│   │   ├── loading.tsx            # Overview skeleton
│   │   ├── error.tsx              # Route error boundary
│   │   ├── scrape/page.tsx        # Acquisition console (client simulation)
│   │   ├── outreach/page.tsx      # AI agent + monitor (client simulation)
│   │   └── packages/page.tsx      # List packages
│   ├── globals.css                # Tailwind v4 import, theme, keyframes
│   ├── layout.tsx                 # Root layout + fonts + providers
│   ├── providers.tsx              # TanStack Query + Toast providers
│   ├── not-found.tsx              # 404
│   └── page.tsx                   # Redirects to /dashboard
├── components/
│   ├── dashboard/                 # Sidebar, header, log console, sidebar context
│   ├── ui/                        # Button, Card, Badge, Field, Skeleton, Toast
│   └── error-boundary.tsx         # Class-based error boundary
├── lib/
│   ├── prisma.ts                  # Prisma singleton
│   ├── data.ts                    # Server-only data-access helpers
│   ├── api.ts                     # API envelope + error mapping
│   ├── validations.ts             # Zod schemas
│   ├── concurrency.ts             # Bounded-concurrency mapper
│   ├── utils.ts                   # cn(), formatters
│   └── providers/skip-trace.ts    # Live provider + deterministic simulator
├── prisma/
│   ├── schema.prisma              # Property + ListPackage models
│   └── seed.ts                    # Sample FL/TX data
├── .env.example
└── package.json
```

## Prerequisites

- **Node.js** `>= 18.18` (Node 20 LTS recommended)
- **npm** (or your preferred package manager)
- A **Supabase** project (free tier is sufficient) — or any Postgres database

## Getting started

```bash
# 1. Install dependencies (also runs `prisma generate` via postinstall)
npm install

# 2. Configure environment
cp .env.example .env
# then edit .env with your Supabase connection strings

# 3. Create the database schema
npx prisma migrate dev --name init

# 4. (Optional) Seed sample properties and packages
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the root redirects to `/dashboard`.

> The **Scrape** and **Outreach** screens run fully client-side simulations, so they work immediately with no database. The **Overview** and **Packages** screens read live data; run the migration (and optionally the seed) to populate them.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Supabase connection (PgBouncer, port `6543`). Used at runtime. |
| `DIRECT_URL` | Yes | Direct connection (port `5432`). Used by Prisma Migrate only. |
| `SKIPTRACE_API_URL` | No | Skip-trace provider endpoint. Leave empty to use the built-in simulator. |
| `SKIPTRACE_API_KEY` | No | Skip-trace provider bearer token. |
| `NEXT_PUBLIC_APP_URL` | No | Public base URL for metadata / absolute links. Defaults to `http://localhost:3000`. |

In Supabase, both connection strings are under **Project Settings → Database → Connection string**. Use the **Transaction** pooler string for `DATABASE_URL` and the direct string for `DIRECT_URL`.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | `prisma generate` then production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run prisma:generate` | Generate the Prisma client |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed sample data |

## API reference

All responses use a consistent envelope:

```jsonc
// success
{ "ok": true, "data": { /* ... */ } }

// error
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

### `POST /api/scrape`

Ingest a batch of scraped properties, de-duplicated against the composite `(address, city, state, zip)` identity. Optionally connect the matched set to a `ListPackage`.

**Request**

```jsonc
{
  "properties": [
    {
      "address": "123 Maple Ave",
      "city": "Tampa",
      "state": "FL",            // 2-letter, uppercased server-side
      "zip": "33602",
      "propertyType": "Land",
      "zoning": "RAC",          // optional
      "scrapeSource": "County Records"
    }
  ],
  "listPackageId": "uuid"       // optional
}
```

**Response**

```jsonc
{
  "ok": true,
  "data": {
    "received": 1,
    "created": 1,
    "duplicates": 0,
    "connectedToPackage": 0
  }
}
```

Limits: 1–500 properties per request.

### `POST /api/skip-trace`

Resolve owner contact details for the given property ids using bounded concurrency. Each property transitions to `SKIP_TRACED` whether or not a match is found; per-item failures are reported instead of aborting the batch.

**Request**

```jsonc
{
  "propertyIds": ["uuid", "uuid"],
  "concurrency": 5              // optional, 1–20, default 5
}
```

**Response**

```jsonc
{
  "ok": true,
  "data": {
    "processed": 2,
    "matched": 1,
    "results": [
      { "id": "uuid", "status": "matched", "ownerName": "Maria Garcia", "confidence": 0.87 },
      { "id": "uuid", "status": "no_match", "reason": "No owner record matched." }
    ]
  }
}
```

Limits: 1–200 ids per request.

## Data model

```prisma
enum LeadStatus { RAW SKIP_TRACED AI_CONTACTED QUALIFIED COLD }

model Property {
  id           String     @id @default(uuid())
  address      String
  city         String
  state        String
  zip          String
  propertyType String
  zoning       String?
  ownerName    String?
  ownerPhone   String?
  ownerEmail   String?
  scrapeSource String
  status       LeadStatus @default(RAW)
  aiNotes      String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  listPackages ListPackage[] @relation("ListToProperties")

  @@unique([address, city, state, zip], name: "property_location")
  @@index([status]) @@index([state]) @@index([scrapeSource]) @@index([createdAt])
}

model ListPackage {
  id          String     @id @default(uuid())
  name        String
  description String
  price       Float
  properties  Property[] @relation("ListToProperties")
  createdAt   DateTime   @default(now())
}
```

The composite unique index on `Property` powers idempotent ingestion: re-scraping the same address is a no-op rather than a duplicate row.

## Simulation vs. live data

To keep the product demonstrable without paid contracts, two surfaces ship with self-contained engines:

- **Scrape** streams synthetic records and traces them client-side. To go live, swap `startScrape` for a `POST /api/scrape` call and the trace handlers for `POST /api/skip-trace`. The component data shapes already mirror the API responses.
- **Outreach** advances synthetic conversations through a probabilistic state machine. To go live, replace the `step` function with your messaging provider plus a backend route and stream real events into the same `LogConsole`.

The **skip-trace provider** (`lib/providers/skip-trace.ts`) already switches automatically: when `SKIPTRACE_API_URL` and `SKIPTRACE_API_KEY` are set it calls the real endpoint (with an 8s `AbortController` timeout and Zod-validated responses); otherwise it uses a deterministic, address-seeded simulator so results are reproducible.

## Roadmap

The engineering critical path (Phases 0–7) is tracked in the build schedule.
Phases 0–5 are complete and live; Phase 6 (hardening) is in progress; Phase 7
(controlled launch) is gated by external long-poles (EIN, 10DLC, attorney).

- [x] **Authentication** on all `/api/*` routes (`INTERNAL_API_SECRET`, Phase 0).
- [x] Live Prisma data for sidebar counts and KPI cards via TanStack Query (Phase 1).
- [x] Real `/api/scrape` + `/api/skip-trace` ingestion and enrichment behind durable Inngest workers (Phases 2–3).
- [x] Compliance backbone — send-time gate, consent, STOP/HELP, DNC, quiet hours, kill switch (Phase 4).
- [x] Live SMS/email outreach + draft-for-approval Claude agent (Phase 5).
- [x] **Phase 6 hardening:** real Supabase RLS policies, public-route rate limiting, structured logs + Sentry with deliverability/opt-out alerts, a11y pass, runbook/on-call docs.
- [ ] Phase 7: staging dry-run, Go/No-Go gate, soft launch under monitoring.

> **Note on simulation surfaces:** the **Scrape** and **Outreach** dashboards
> retain client-side demo engines for offline demonstration, but the real
> ingestion, skip-trace, compliance, and outreach paths are live server-side and
> are the source of truth in production.

## Deployment

1. Push this repository to a private GitHub repo.
2. Import the repo into **Vercel**.
3. Add the environment variables from [Environment variables](#environment-variables) to the Vercel project.
4. Ensure the build command is `npm run build` (runs `prisma generate` first).
5. Run `npx prisma migrate deploy` against your production database (e.g. as a release step or manually) before first traffic. This includes the Phase 6 `*_phase6_rls_hardening` migration, which locks the Supabase Data API down.
6. Configure observability: set `SENTRY_DSN` and wire a Vercel Log Drain to alert on the events listed in [`RUNBOOK.md`](./RUNBOOK.md) (§3). Tune public-route rate limits via `RATE_LIMIT_*`.

Supabase and Vercel both offer generous free tiers suitable for staging. See
[`RUNBOOK.md`](./RUNBOOK.md) and [`ON-CALL.md`](./ON-CALL.md) for operations and
incident response.

## Security & compliance

- **API authentication is enforced.** Every `/api/*` route requires
  `INTERNAL_API_SECRET` (constant-time check in `lib/auth.ts`, gated by
  `middleware.ts`). The browser never calls these routes — it uses server
  actions — and four self-authenticating routes (`/api/inngest`, `/api/scrape`,
  `/api/inbound/*`, `/api/unsubscribe`) verify their own signatures/tokens and
  are additionally **rate-limited per IP** (Phase 6).
- **Row-Level Security (Phase 6).** Every table has RLS forced and the Supabase
  Data API roles (`anon`/`authenticated`) are denied and stripped of grants. All
  access is server-side via the `postgres` role (BYPASSRLS). Verify with the
  queries in [`RUNBOOK.md`](./RUNBOOK.md) §4.
- **Compliance is enforced in code (Phases 4–5).** A single fail-closed send-time
  gate checks consent, suppression, national DNC, recipient-local quiet hours,
  frequency caps, sender identity, and a global kill switch (defaults OFF) before
  any dispatch. STOP/HELP and one-click unsubscribe are wired to the Suppression
  ledger. This is not legal advice — confirm messaging, consent, and data
  sourcing with a qualified TCPA/telemarketing attorney before live outreach.
- **Secrets** live only in env (`.gitignore` blocks every `.env*` except
  `.env.example`). Never commit connection strings or API keys; rotate any leaked
  token immediately (see RUNBOOK §4).

## License

Proprietary — all rights reserved. See [LICENSE](./LICENSE). Update the copyright holder to your registered business entity.
