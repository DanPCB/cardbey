# Impact Report — Seed PUBLISHED_STORES_BACKFILL candidates from Business

## What could break
- Operator overwrite of existing `published:{storeId}` candidate rows (same id upsert merges fields)
- Enrichment of the wrong Business set if filter is too broad
- Writing to a different `candidates.json` than the API uses (path mismatch)

## Why
- Render disk is ephemeral; `PUBLISHED_STORES_BACKFILL` rows were never committed and are gone from the default path
- `fix-backfill-candidates.mjs` hardcodes `data/businessCandidates/` and ignores `BUSINESS_CANDIDATE_DIR` / tmp fallback used by the repository

## Impact scope
- New opt-in script: seed thin published Business → candidates
- Repair script path resolution aligned with `resolveBusinessCandidateStoreRoot`
- Enrich CLI: honor `--maxCandidates`

## Smallest safe patch
- Upsert only by `id=published:{Business.id}`; never delete other batches
- Default filter: `publishedAt != null` and phone/address/email/websiteUrl all empty
- Dry-run flag; print resolved store root before write
