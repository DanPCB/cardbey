# Seed Library: Backfill / Initial Seed Run

## Apply the migration

```bash
cd apps/core/cardbey-core
npx prisma migrate deploy
# or in dev: npx prisma migrate dev --name add_seed_library_models
npx prisma generate
```

## Backfill options

The new tables (`SeedAsset`, `SeedAssetFile`, `SeedIngestionJob`) are **not** used by the current store-creation workflow. The dashboard image autofill still reads from `seedLibrary.json` until you wire it to the DB.

### Option A: One-off script (recommended for initial seed)

1. Create a script (e.g. `scripts/seed-library-ingest.js`) that:
   - Creates a `SeedIngestionJob` with `provider: "pexels"`, `status: "running"`.
   - Calls Pexels/Unsplash/Pixabay API (with API key) for queries by vertical/category (e.g. "nails product photo", "burger food").
   - For each result: compute `sha256` of image URL or downloaded bytes (optional but recommended for dedupe); insert `SeedAsset` with `provider`, `providerAssetId`, `sourcePageUrl`, `photographerName`, `licenseName`, `attributionText`, `width`, `height`, `tags` (JSON), `vertical`, `categoryKey`, `sha256`, `ingestionJobId`. Insert `SeedAssetFile` with `fileUrl` (provider’s image URL), `role: "full"`, and optionally a thumb URL as a second row with `role: "thumb"`.
   - Use `CREATE ... ON CONFLICT(provider, providerAssetId) DO NOTHING` (or Prisma `upsert`) to avoid duplicates.
   - On completion, set job `status: "completed"`, `completedAt: now()`.

2. Run the script locally or in a one-off job:  
   `node scripts/seed-library-ingest.js`

### Option B: Scheduled job

- Run the same logic on a schedule (e.g. weekly), creating a new `SeedIngestionJob` each run. Keeps the library updated; respect API rate limits.

### Option C: Sync from existing JSON

- If you have `seedLibrary.json`, write a small script that reads it and inserts into `SeedAsset` / `SeedAssetFile` with a synthetic `provider` (e.g. `"legacy_json"`) and `providerAssetId` from array index or a hash of the URL. Set `sha256` to null or compute from URL for future dedupe.

## Wiring autofill to the DB (later)

- In the dashboard, add a path that queries `SeedAsset` (e.g. by `vertical`, `categoryKey`, `status: "active"`) and maps results to the shape expected by `searchLibrary`. Either replace `searchLibrary()` calls with a DB-backed implementation or merge DB results with the existing JSON library.

## Constraints

- **Unique `(provider, providerAssetId)`**: one row per provider asset; use upsert on backfill.
- **Unique `sha256`**: when set, prevents duplicate images across providers; backfill can set it after download or leave null for legacy rows.
- **No impact on Draft → Preview → Publish**: these tables are standalone; no foreign keys from `DraftStore`, `Business`, or `Product`.
