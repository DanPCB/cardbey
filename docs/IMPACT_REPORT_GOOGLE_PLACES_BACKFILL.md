# Impact Report — Google Places backfill for published stores

## What could break
- Wrong Google Places match written onto a Business row (generic names)
- Overwrite of intentional empty fields if guards fail
- Candidate inventory path mismatch (`BUSINESS_CANDIDATE_DIR` vs local data/)
- Places API quota / REQUEST_DENIED if key lacks Places API

## Why
- Enrichment only reads Places data from `candidate.rawSourceJson` (empty for backfill)
- OSM/Foursquare return nothing for generic `suburb: Melbourne`
- Contact must be written onto durable `Business` rows

## Impact scope
- New opt-in scripts only (no enrichment agent / API route changes)
- Direct `prisma.business.update` when `BACKFILL_APPLY=1` or `--apply`
- Optional candidate location / `rawSourceJson` upsert for `PUBLISHED_STORES_BACKFILL`

## Smallest safe patch
- Standalone `google-places-backfill.mjs` — dry-run by default
- Never overwrite non-empty Business fields
- Skip results whose address fails location confidence check
- Rate limit 200ms between API calls
- Separate `sync-backfill-candidate-locations.mjs` for Phase 2 suburb copy
