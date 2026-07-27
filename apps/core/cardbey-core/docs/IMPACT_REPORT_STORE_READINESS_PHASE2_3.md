# Impact Report: Store Readiness Phase 2 + 3

## Goal

Phase 2: Guided intelligence — structured evidence, deep-links with labels/filters, explanation API, vertical rules, impact estimates, seller grounding, dev diagnostics.  
Phase 3: Governed draft generation — ReadinessDraft proposals, owner approve/reject/regenerate, apply via existing mutation APIs only, then refresh snapshot.

## What could break

1. Clients expecting `evidence` as `string[]` may break if shape changes without dual support.
2. New draft apply paths could mutate live Business/Product if approval is skipped.
3. Seller PIL could leak draft content into consumer context if stores are mixed.
4. Vertical rules could over-score niche businesses (false must_fix).

## Why

Extends the existing readiness pipeline without bypassing `StoreReadinessSnapshot`. Drafts are a new proposal layer; writes only after explicit owner approval through existing PATCH paths.

## Impact scope

- Core: `src/lib/storeReadiness/**` (evidence, explain, verticals, impact, drafts, diagnostics), routes
- Dashboard: panel deep-link labels, explain/draft UI, seller grounding helpers, flags
- Consumer PIL: unchanged (seller store remains isolated)

## Smallest safe patch

1. Dual-shape evidence: structured `evidence` object + derived `evidenceLines[]`
2. Explanation endpoints read-only from snapshot
3. Drafts in process store (no Prisma migration); apply via existing Business/Product/DraftStore patches after approval record
4. Feature flag `ENABLE_STORE_READINESS_DRAFTS_V1` / `VITE_ENABLE_STORE_READINESS_DRAFTS_V1` for Phase 3
5. Tests for evidence, explain, verticals, deep-links, grounding, draft lifecycle, no consumer leak

## No-parallel-stack proof

Does not replace Mission 1000 readiness, DraftStore publish, or consumer PIL. Performer generates draft proposals only; Seller PIL explains from snapshot; apply uses existing mutation APIs.
