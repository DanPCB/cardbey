# IMPACT REPORT — Creators showcase fidelity + seed

Date: 2026-08-27  
Tracks: A (seed published showcase content), B (Services type + empty CTA + related)

## What could break

1. **Showcase Services filter** — mapping `services` → `SERVICE` never matches published `CREATOR_SERVICE` rows; filter stays empty even after seed.
2. **Topic filters (Business, AI, …)** — `categories: { has }` on Prisma `Json?` can throw / return empty; Business rail stays empty after seed.
3. **Seed apply** — writes `Creator` + `CreatorContent` (+ may attach to an existing User); wrong gate fields look like empty table.
4. **Empty-state CTA** — changing marketplace empty copy globally would redirect normal marketplace empties to Creator Studio (must be lens-scoped).

## Why

- Schema / publishing types use `CREATOR_SERVICE`; showcase `TYPE_FILTER_MAP` still uses `SERVICE`.
- `Creator.categories` is `Json?`, not a scalar list; `has` is invalid for Json.
- Public gate is `status: 'published'` **and** `visibility: 'public'` (not `publishedAt` alone).
- Empty UI reuses marketplace `others` copy + hardcoded `/frontscreen` CTA.

## Impact scope

- Core: `creatorShowcaseService.js`, tests, new gated seed script
- Dashboard (Track B CTA/i18n): `ArtifactFeed` / Creator lens only — optional follow-up PR
- Live DB: seed only after dry-run + `CARDBEY_CONFIRM_LIVE_REPAIR=1 --apply`

## Smallest safe patch

1. Map `services`/`service` → `CREATOR_SERVICE`; accept legacy `SERVICE` as alias if any rows exist.
2. Topic filter: require active creator, then in-memory category match (same pattern as `listPublicCreators` business).
3. Seed script: dry-run default; set both gate fields; mixed types/categories.
4. Empty CTA: Creator-lens-only prop → `/creator-studio` (do not change marketplace empty).
