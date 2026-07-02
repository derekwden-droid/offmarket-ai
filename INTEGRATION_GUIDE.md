# OffMarket.AI — Additions Integration Pack

This pack contains two major feature additions:
1. **Opportunity Scoring Engine** — heuristic scoring of parcels across 5 dimensions
2. **Land Vacancy Verification** — multi-source vacancy verification before skip-tracing

## Quick Start

```bash
# 1. Replace your schema.prisma with the one in this pack
#    (or diff it and merge the additions manually)
cp prisma/schema.prisma prisma/schema.prisma.backup
cp additions/prisma/schema.prisma prisma/schema.prisma

# 2. Run migration
npx prisma migrate dev --name add_vacancy_and_scoring
npx prisma generate

# 3. Copy files into repo
cp -r additions/lib additions/app additions/tests ./

# 4. Replace validations.ts
cp additions/lib/validations.ts lib/validations.ts

# 5. Verify
npm run typecheck
npm run test
```

## Files included

| File | Target path | Description |
|------|-------------|-------------|
| `lib/scoring/opportunity.ts` | `lib/scoring/opportunity.ts` | 5-dimension scoring engine |
| `lib/scoring/from-property.ts` | `lib/scoring/from-property.ts` | Prisma-to-signals mapper |
| `lib/scoring/opportunity.test.ts` | `lib/scoring/opportunity.test.ts` | Scoring tests |
| `lib/providers/parcel-intelligence.ts` | `lib/providers/parcel-intelligence.ts` | Vacancy evidence providers |
| `lib/services/vacancy-consensus.ts` | `lib/services/vacancy-consensus.ts` | Vacancy consensus engine |
| `lib/services/vacancy.ts` | `lib/services/vacancy.ts` | Vacancy verification service |
| `app/api/verify-vacancy/route.ts` | `app/api/verify-vacancy/route.ts` | API route |
| `lib/validations.ts` | `lib/validations.ts` | **Replace** existing file |
| `prisma/schema.prisma` | `prisma/schema.prisma` | **Replace** existing file |
| `tests/vacancy-consensus.test.ts` | `tests/vacancy-consensus.test.ts` | Consensus tests |
| `tests/from-property.test.ts` | `tests/from-property.test.ts` | Signal mapper tests |

## Changes made from your original files

### Opportunity scoring
- Exported `DIMENSION_ORDER` (needed for weight-sum test)
- Added `zip5` normalization in `from-property.ts` to handle ZIP+4 codes
- Added `from-property.test.ts` with ZIP+4 normalization test
- Added weight-sum validation test and false-vs-null distinction test in `opportunity.test.ts`

### Vacancy verification
- Added `now: Date` injectable parameter to `computeVacancyConsensus` for deterministic testing
- Renamed `imageryStructureDetected` → `structureDetected` in DB write (it was capturing any structure signal, not just imagery)
- Added `tests/vacancy-consensus.test.ts` covering veto, stale imagery, disagreement, and assessor logic

### Validations
- Merged your existing validations with new `verifyVacancySchema` and `verifyVacancyConfigSchema`

### Schema
- Added `VacancyStatus` and `DealStage` enums
- Added `VacancyVerification` model
- Added geospatial/assessor fields to `Property` (apn, lat, lng, parcelGeometry, landUseCode, dealStage)
- Added relation from `Property` to `VacancyVerification`

## Environment variables

### Vacancy verification
| Variable | Purpose | Default |
|----------|---------|---------|
| `FOOTPRINT_FEATURESERVER_URL` | ArcGIS REST FeatureServer URL | simulator |
| `FOOTPRINT_FEATURESERVER_TOKEN` | Secured layer token | none |
| `NEARMAP_API_KEY` | Nearmap AI Feature API | simulator |
| `NEARMAP_API_BASE` | Nearmap base URL | `https://api.nearmap.com` |
| `NEARMAP_AI_FEATURE_PATH` | AI Feature endpoint | `/ai/features/v4/features.json` |

## Next steps after dropping in

1. **Run the migration** — this is the hard blocker. Without it, the vacancy code won't compile.
2. **Add user auth** — still the #1 gap in the repo. The dashboard at `/dashboard` has no auth gate.
3. **Wire scoring to the dashboard** — add a `score` field to the Property table or a separate `PropertyScore` table, and surface it in the UI.
4. **Wire vacancy to the pipeline** — call `verifyPropertyVacancy` before enqueueing skip-trace jobs for land parcels.
5. **Write end-to-end tests** — the unit tests are here, but you need integration tests for the full `POST /api/verify-vacancy` route.

## Important reminders

- `score` in the opportunity engine is a **heuristic**, not a calibrated probability. Don't label it as "% likelihood to sell" in the UI until you have ground-truth data.
- The vacancy consensus engine requires **2+ corroborating sources** for `CONFIRMED_VACANT`. With only footprint + imagery, both must agree.
- The ToS compliance note stands: never use Google/Mapbox/Bing tiles for structure detection.
- `dealStage` replaces `LeadStatus` as the primary pipeline stage for new properties. Existing `LeadStatus` is preserved for backward compatibility.
