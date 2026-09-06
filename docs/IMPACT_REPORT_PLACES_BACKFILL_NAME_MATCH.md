# Impact Report — Harden Google Places backfill name matching

## What could break
- Fewer stores patched (intentional — rejects weak first-hit matches)
- True positives rejected if name tokens are sparse (e.g. heavy abbreviation)

## Why
- Dry-run showed many wrong matches (Myer for Spring Collection, Pho Hung for Pho Ngon Footscray, Cat Hotel for WonderLand homestay) because location gate accepted any VIC address when suburb was Melbourne

## Impact scope
- `google-places-backfill.mjs` + `scripts/lib/googlePlacesBackfillMatch.mjs` only
- No enrichment agent / API changes

## Smallest safe patch
- Require name similarity; try top-5 Places results
- Skip known generic names/slugs
- Use slug suburb hints in query + address check
- `--slugs=` allowlist for cautious apply
