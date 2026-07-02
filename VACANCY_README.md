# Land Vacancy Verification — integration pack

Multi-source vacancy verification so skip-trace budget is only spent on parcels
that are genuinely vacant. Improves the **precision of what you trace**, feeding
the existing `DealStage.SKIPTRACE_READY` gate. It does **not** change skip-trace
match rate (a vendor property) and does **not** change the FTSA/consent outreach
gate — a verified-vacant parcel still hits that gate before any contact.

## Files (drop into repo at these paths)

| File in this pack | Repo path |
|---|---|
| `lib/providers/parcel-intelligence.ts` | `lib/providers/parcel-intelligence.ts` |
| `lib/services/vacancy-consensus.ts` | `lib/services/vacancy-consensus.ts` |
| `lib/services/vacancy.ts` | `lib/services/vacancy.ts` |
| `app/api/verify-vacancy/route.ts` | `app/api/verify-vacancy/route.ts` |
| `lib/validations.additions.ts` | **append contents to** `lib/validations.ts` |

## Prerequisites (from the land-verification schema pack)

These must already exist in `prisma/schema.prisma`: enums `VacancyStatus`,
`DealStage`; model `VacancyVerification`; and `Property.parcelGeometry`,
`Property.landUseCode`, `Property.apn`, `Property.lat`, `Property.lng`,
`Property.dealStage`. Run `npx prisma generate` after adding this pack so the
imported Prisma enums/types resolve.

## Environment variables

All optional. With none set, both providers run a **deterministic, address-seeded
simulator** — the endpoint works end-to-end offline for dev/CI.

| Var | Purpose | Default |
|---|---|---|
| `FOOTPRINT_FEATURESERVER_URL` | ArcGIS REST FeatureServer **layer** URL hosting building footprints (Microsoft Global ML / Overture / county). Structure check is a spatial intersect. Free + ODbL. | simulator |
| `FOOTPRINT_FEATURESERVER_TOKEN` | Token if the layer is secured | none |
| `NEARMAP_API_KEY` | Nearmap AI Feature API key — the **current-imagery** signal with a capture date | simulator |
| `NEARMAP_API_BASE` | Nearmap API base | `https://api.nearmap.com` |
| `NEARMAP_AI_FEATURE_PATH` | AI Feature endpoint path (pin the version here; confirm against developer.nearmap.com/docs/ai-api) | `/ai/features/v4/features.json` |

## Provider decision (why this stack)

- **Footprints (free, ODbL):** Microsoft Global ML / Overture answer "is there a
  structure" cheaply via parcel-polygon intersect. They lag and carry false
  positives, so they are corroborating, not authoritative.
- **Nearmap (paid, analysis-permitted):** the recency source — results carry a
  capture date, so "current" is enforceable.
- **Assessor land-use / vacant flag:** cheap tie-breaker from your parcel data.
- **Not used:** Google / Mapbox / Bing map tiles. Their ToS prohibits deriving
  building outlines and running ML/object-detection over the imagery. Using them
  for structure detection is a ToS breach — kept out by design.

The consensus engine cross-checks these: a confident structure signal vetoes to
`NOT_VACANT`; agreement + fresh imagery + 2+ sources yields `CONFIRMED_VACANT`;
stale imagery or a lone source yields `PROBABLE_VACANT` + review; disagreement
yields `UNCERTAIN` + review. It never silently trusts one boolean.

## Deal-stage side effects

- `NOT_VACANT` → `dealStage = DEAD`
- `CONFIRMED_VACANT` / `PROBABLE_VACANT` → promotes `INGESTED`/`ENRICHED` to
  `VERIFIED_VACANT` (never downgrades a higher stage, never revives `DEAD`)
- `UNCERTAIN` / `UNKNOWN` → stage unchanged, `reviewRequired = true`

## Test

```bash
curl -X POST http://localhost:3000/api/verify-vacancy \
  -H 'content-type: application/json' \
  -d '{ "propertyId": "REPLACE_WITH_REAL_UUID" }'
```

With no provider env set you get a deterministic simulated verdict for that
property (same input → same output). Set `FOOTPRINT_FEATURESERVER_URL` and/or
`NEARMAP_API_KEY` to switch each source to live data independently.
