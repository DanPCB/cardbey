# Impact Report: PIL Seller Assistant — Store Readiness V1

## Goal

Add a **seller-only** store readiness capability so owners can answer “What should I do next to make my store ready?” without mixing private seller context into consumer PIL.

## What could break

1. Consumer PIL could accidentally receive seller readiness data if adapters share the same context path.
2. New API could leak another owner’s store if ownership checks are wrong.
3. Business Studio UI could regress if the readiness panel mounts without a feature flag.

## Why

New authenticated endpoint + optional Studio panel + separate seller PIL context adapter. Deterministic checks only in V1 (no LLM DB access).

## Impact scope

- Core: `src/lib/storeReadiness/*`, `src/routes/storeReadinessRoutes.js`, `server.js` mounts, `features.js` flags
- Dashboard: `src/lib/storeReadiness/*`, `src/features/storeReadiness/*`, `src/lib/pil/seller/*`, StoreDraftReview mount, `featureFlags` / Vite flags
- Consumer PIL paths untouched when flags are off

## Smallest safe patch

1. Canonical DTO + rule registry + aggregator (pure functions + Prisma load)
2. `GET /api/stores/:storeId/readiness` (+ business-studio alias) with `requireAuth` + owner check
3. Seller-safe context builder that never includes credentials/paths
4. Flag-gated Studio panel + PIL seller adapter
5. Unit tests for rules, ownership, prioritization, sanitization

## No-parallel-stack proof

Does not replace Mission 1000 readiness or `audit_store_completeness`; reuses ownership patterns from growth routes. Consumer PIL context resolver unchanged.
