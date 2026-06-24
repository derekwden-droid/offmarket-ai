# Contributing to OffMarket.AI

This is a private repository for the OffMarket.AI founding team. These
conventions keep a two-person workflow fast and low-friction while protecting
`main`.

## Branching

- `main` is always deployable. Never push directly to `main`.
- Branch off `main` for every change using a descriptive prefix:
  - `feat/…` — new functionality
  - `fix/…` — bug fixes
  - `chore/…` — tooling, deps, config
  - `refactor/…` — internal changes with no behavior change
  - `docs/…` — documentation only

```bash
git checkout main
git pull
git checkout -b feat/overview-kpi-refetch
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scrape): add source filter to acquisition console
fix(api): return 404 when listPackageId is invalid
chore(deps): bump prisma to 6.2.1
```

Keep commits focused and the subject line under ~72 characters.

## Pull requests

1. Push your branch and open a PR against `main`.
2. Fill in what changed and why; include screenshots for UI changes.
3. Ensure checks pass locally before requesting review (see below).
4. With a two-person team, one approval from the other founder is required to
   merge. Use **Squash and merge** to keep `main` history linear.

## Local checks (run before every PR)

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit — must pass with zero errors
npm run build       # production build sanity check
```

## Code style

- **TypeScript strict mode**: the `any` type is not allowed. Prefer precise
  types, `unknown` with narrowing, or generics.
- **Client/server boundary**: keep shells and data-reading pages as server
  components; isolate interactivity into dedicated `"use client"` components.
  Modules in `lib/` that touch the database or providers import `server-only`.
- **Styling**: use Tailwind utilities for layout/spacing; use inline styles with
  literal hex values for exact design-token fidelity and glow/shadow effects, as
  established across the codebase.
- **No placeholders**: code merged to `main` should be complete and runnable —
  no `TODO`-stubbed function bodies in shipped paths.
- **Validation**: validate all external input (API routes, provider responses)
  with Zod.

## Environment setup

```bash
npm install
cp .env.example .env   # fill in Supabase connection strings
npx prisma migrate dev
npm run db:seed        # optional sample data
npm run dev
```

Never commit `.env` or real secrets.

## Prisma & migrations

- Edit `prisma/schema.prisma` for any data-model change, then run:

  ```bash
  npx prisma migrate dev --name short_description
  ```

- **Commit the generated migration files** in `prisma/migrations/` together with
  the schema change in the same PR.
- For production, migrations are applied with `npx prisma migrate deploy` — never
  `migrate dev` against a production database.
- If you change the schema, update the seed script and the README data-model
  section when relevant.

## Dependencies

- Pin or use caret ranges consistent with the existing `package.json`.
- Call out any new runtime dependency in the PR description with a one-line
  justification.

Thanks for keeping the codebase clean and shippable.
