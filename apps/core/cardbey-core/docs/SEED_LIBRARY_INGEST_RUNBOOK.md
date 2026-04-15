# Seed Library Ingestion Runbook

Ingest legal stock photos (Pexels) into the Seed Library DB for image autofill. **Does not touch the store-creation workflow** (Draft → Preview → Publish).

## Prerequisites

- `DATABASE_URL` set (e.g. `file:./prisma/dev.db` or Postgres).
- **Pexels:** [Create a Pexels API key](https://www.pexels.com/api/) and set `PEXELS_API_KEY` in env.
- Migrations applied: `npx prisma migrate deploy` (includes `add_seed_library_models`).

## CLI

```bash
# From repo root (or apps/core/cardbey-core)
pnpm seed:ingest --provider pexels --vertical food --limit 200
pnpm seed:ingest --provider pexels --vertical beauty --limit 100
```

| Arg | Default | Description |
|-----|---------|--------------|
| `--provider` | `pexels` | Only `pexels` is implemented. |
| `--vertical` | `food` | One of `food`, `beauty`, `services`. Drives search queries. |
| `--limit` | `200` | Max number of photos to fetch and process. |

## What the script does

1. Creates a **SeedIngestionJob** (status `running`).
2. Calls Pexels API with vertical-specific queries (e.g. food: "food dish", "burger", "dessert pastry"). **Rate limiting:** after each page, waits so requests stay under `SEED_INGEST_RATE_LIMIT_PER_MINUTE`. **Retry:** provider fetch and each download use exponential backoff (up to `SEED_INGEST_MAX_RETRIES`).
3. For each photo: skips if on reject banlist or existing asset is `status=rejected`; downloads image, computes **sha256**; skips if sha256 in banlist or existing (deduped or rejected).
4. Saves file to local storage: `storage/seed-assets/pexels/{id}.jpg` (override with `SEED_LIBRARY_STORAGE_PATH`).
5. Optionally creates a **medium** variant (800px width) if `sharp` is available; otherwise uses Pexels medium URL.
6. **Upserts** SeedAsset by `(provider, providerAssetId)`; sets attribution, licenseUrl, sourcePageUrl.
7. Creates **SeedAssetFile** rows (role `full` and `medium`).
8. Sets job to `completed` (or `failed`) with counts and any errors in `meta` / `errorMessage`.

## Env

| Variable | Required | Description |
|----------|----------|-------------|
| `PEXELS_API_KEY` | Yes (for pexels) | Pexels API key. |
| `DATABASE_URL` | Yes | Prisma DB URL. |
| `SEED_LIBRARY_STORAGE_PATH` | No | Directory for saved files. Default: `storage/seed-assets` under cwd. |
| `SEED_INGEST_RATE_LIMIT_PER_MINUTE` | No | Max provider API requests per minute (default `30`). Delay is applied after each page fetch. |
| `SEED_INGEST_MAX_RETRIES` | No | Retries for provider fetch and download (default `3`). |
| `SEED_INGEST_BACKOFF_BASE_MS` | No | Base delay in ms for exponential backoff (default `1000`). |
| `SEED_REJECT_SHA256` | No | Comma-separated sha256 hashes to reject (banlist). Skipped assets counted as `rejected`. |
| `SEED_REJECT_PROVIDER_IDS` | No | Comma-separated provider asset IDs to reject (e.g. `pexels:123` or `123`). Skipped counted as `rejected`. |

## Storage

- Files are written under `SEED_LIBRARY_STORAGE_PATH` or `./storage/seed-assets`.
- Path pattern: `{provider}/{providerAssetId}.jpg` (full), `{provider}/{providerAssetId}_medium.jpg` (if resized).
- SeedAssetFile.fileUrl stores a URL path (e.g. `/seed-assets/pexels/123.jpg`) for use when serving or building image URLs.

## Metrics (job.meta and logs)

After each run, `SeedIngestionJob.meta` and console output include:

| Metric | Meaning |
|--------|---------|
| `fetched` | Number of photos returned by the provider (before dedupe/reject). |
| `upserted` | Number of SeedAsset rows created or updated. |
| `downloaded` | Number of images successfully downloaded. |
| `deduped` | Skipped because another active SeedAsset already has the same sha256. |
| `rejected` | Skipped because of banlist (`SEED_REJECT_*`) or existing asset with `status=rejected`. |
| `failed` | Per-photo errors (download/upsert failures). |

## Dedupe and reject/banlist

- **sha256:** Before inserting, the script checks if another SeedAsset already has the same sha256. If **active**, the photo is skipped (counted as `deduped`). If **rejected**, skipped (counted as `rejected`).
- **Reject banlist:** Assets whose sha256 is in `SEED_REJECT_SHA256` or whose `provider:providerAssetId` is in `SEED_REJECT_PROVIDER_IDS` are skipped and counted as `rejected`. Existing DB rows with `status=rejected'` are also skipped.
- **provider + providerAssetId:** Upsert ensures one row per provider asset; re-runs update metadata and replace file rows.

## Rejected status and banlist

- **SeedAsset.status** can be `active`, `disabled`, `failed_validation`, or `rejected`. Only `active` assets are used for placeholder/fallback (e.g. `getSeedImageForCategory`).
- **SeedAsset.rejectReason** (optional) stores a reason when `status=rejected` (e.g. "banlist", "manual review").
- To mark an asset rejected: update the row with `status: 'rejected'` and optional `rejectReason`. Ingestion will skip that asset on re-runs (counted as `rejected`).

## Adding more providers

1. Implement an adapter in `src/lib/seedLibrary/adapters/` with `searchPhotos(query, page, perPage)` returning `{ photos: NormalizedPhoto[], totalResults?, page? }`.
2. In `scripts/seed-ingest.js`, branch on `--provider` and call the correct adapter.
3. NormalizedPhoto shape: id, url, width?, height?, photographerName?, photographerUrl?, sourcePageUrl?, licenseUrl?, attributionText?, alt?, src?.

## Troubleshooting

- **PEXELS_API_KEY is required:** Set in `.env` or export before running.
- **Download failed / rate limit:** Pexels allows 200 req/h. Reduce `--limit` or run later.
- **Unique constraint sha256:** Expected when the same image is returned under different queries; those rows are skipped (skippedDedupe count).
- **Job status failed:** Check `SeedIngestionJob.errorMessage` and `meta` for the run.
