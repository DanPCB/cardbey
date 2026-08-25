# Impact Report — Phase 3 Attribution spine + AI referral classifier

Date: 2026-08-25  
Depends on: Phase 1 SKP + Phase 2 prerender  
Scope: enable existing marketing attribution code paths; add AI referral classification

## Change summary

1. Add missing `Features.marketingOperator` (v1, attributionV1, …) — currently referenced but absent from `features.js`.
2. Mount existing `marketingVisitRoutes` + `marketingOperationsRoutes` behind the flag.
3. Add `classifyReferral()` (UTM + referrer → AI_SEARCH / ORGANIC / …) and attach to visit ingest metadata.
4. Set SKP `visibility.aiSearchReady` only when indexable + jsonLdReady + `Features.marketingOperator.attributionV1`.

## Persistence note

`MarketingConversion` / `MarketingAttributionTouch` SQL tables exist from prior migrations, but **Prisma schema models are not present** in current `schema.prisma`. The marketingRepo already fail-opens when delegates are missing. Phase 3 does **not** add a parallel `VisitAttribution` Prisma model (would fork the spine). Referral classification is stored in conversion **metadata** (`referralClass`, `aiEngine`). Full Prisma model sync is a separate controlled migration.

## (1) What could break

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Flag default ON accidentally enables admin marketing | Medium | Default OFF in all envs; require ENABLE_MARKETING_OPERATOR_V1 |
| Visit ingest spam | Low | Existing rate limit on `/visits` |
| Prisma MarketingConversion missing | Existing | marketingRepo already fail-open; classifier is pure |
| Premature AI visibility claims | High if mis-set | aiSearchReady still requires attributionV1 flag + crawlable SKP |

## (2) Why

Attribution + visit routes already exist but are dead (no Features object, unmounted). Phase 3 wires them rather than inventing a parallel stack.

## (3) Impact scope

- Core features.js, server.js mounts, visitCapture metadata, new classifyReferral module, SKP visibility flag
- No Business writes from classifier
- No llms.txt / AI sitemap

## (4) Smallest safe patch

Add flags (default off) → mount routes → classifier + tests → gate aiSearchReady on attributionV1.
