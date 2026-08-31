# IMPACT REPORT — Seed Completeness Gate + SuperAdmin Hero Curation

Date: 2026-08-17  
Scope: Batch 0 QA unblock — deterministic completeness scoring + admin hero curation  
Status: **IMPLEMENTING** (user spec is the authorization)

## (1) What could break

- QA **Approve** for seeds that currently pass `canPromoteToClaimable` (only `HERO_MISSING` / duplicate / status today)
- Batch 0 seeds with no menu/items if `ITEMS_INSUFFICIENT` were treated as an approve blocker (all 10 would stay un-approvable)
- Claimed/activated seeds if curation overwrote live store media
- Prisma generate/migrate if `business_seed` columns or `seed_curation_events` mismatch the client
- Image fetch SSRF if admin-pasted URLs are fetched without size/type caps

## (2) Why

- Completeness scoring is a new machine-readable layer on seeds (`completenessTier` / blockers / gaps)
- Curation writes hero URL + provenance `admin_curated` and clears `HERO_MISSING`
- Approve currently maps to `seeded_claimable`, not a `published` status — the guard must attach to `approveSeed` / `canPromoteToClaimable`

## (3) Impact scope

- `apps/core/cardbey-core/src/lib/ingestion/*` (pure scorer + persist + curation)
- `QaQualityGates` / `QaPromotionService` (approve error payload includes `blockers`)
- `businessIngestionRoutes` (admin-only `/curate/hero` and `/completeness/recompute`)
- Prisma postgres + sqlite: additive columns on `business_seed` + `seed_curation_events`
- Control Center `SeedRecordsTable` / `QaReviewPage` (tier columns + Set hero modal)
- Ingestion pipeline + Melbourne Batch 0 enricher: stamp completeness after write
- Does **not** publish stores, send owner email, or claim ownership

## (4) Smallest safe patch

1. Pure `computeSeedCompleteness()` + `toSeedSnapshot()` + unit tests (no I/O)
2. Persist onto `IngestedSeedRecord` (already stored in `rawPayload`) and denormalize onto `BusinessSeed` columns
3. Approve gate: keep existing `HERO_MISSING` qaFlag; also refuse **identity/hero** completeness blockers (`HERO_*`, `NAME_MISSING`, `CATEGORY_MISSING`, `ADDRESS_OR_HOURS_MISSING`). **`ITEMS_INSUFFICIENT` stays a completeness blocker for the tier, but does not block QA approve to `seeded_claimable`** until item extraction ships (otherwise Batch 0 cannot be approved). Documented deviation from spec table.
4. Curation: admin-only; only `seeded_pending_qa`; 409 on claimed/activated; 422 on low-res/SVG; append-only event log; clear `HERO_MISSING`; recompute in-request
5. No `prisma migrate dev`; additive SQL only

## Governance

- Curation is not a publish/claim/message path; `autoSubmit` N/A
- Fetch of admin-supplied URLs is server-side with 10s timeout, 15 MB cap, image MIME allow-list (no SVG)
