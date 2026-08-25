# Impact Report — Phase 1 Store Knowledge Projection (SKP)

Date: 2026-08-25  
Branch: `fix/enrichment-pipeline-e2e`  
Scope: additive Core module only

## Change summary

Introduce a **read-only** Store Knowledge Projection under
`apps/core/cardbey-core/src/lib/storeKnowledge/` that unifies:

- `Business` row (identity / contact / location)
- `PublishedArtifactProjection.projectionJson` (commerce / hero / content)
- optional Mission 001 catalog provenance (when present on draft/catalog meta)
- optional BOI snapshot fields (when passed in; not auto-mounted)

Plus a shared `ProvenanceTag` enum and adapters from existing Mission 001 /
BOI vocabularies.

## (1) What could break

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Public store API shape change | Low | Phase 1 does **not** rewire `publicUsers.js` or `toPublicStore` |
| Prisma schema / migrations | None | No schema changes in Phase 1 |
| Publish / draft pipelines | Low | Builder is pure; no writes to Business / User / seeds |
| Mission 001 catalog semantics | Low | Only **adds** optional `skpProvenance` alongside existing `provenanceStatus` |
| Import cycles | Low | New leaf module; adapters import SKP, Mission 001 does not import builder |

## (2) Why

New files only (+ one thin provenance bridge). Downstream SSR, attribution, and
Performer wiring are explicitly deferred to later phases.

## (3) Impact scope

- **In scope:** `src/lib/storeKnowledge/*`, Mission 001 provenance bridge,
  unit tests, this report.
- **Out of scope:** `/s/:slug` SSR, sitemap, attribution, BOI route mounts,
  Performer context rewrite, Virtual KOL, citation probes, `llms.txt`.

## (4) Smallest safe patch

1. Add provenance enum + field wrapper.
2. Add SKP schema (JSDoc) + pure `buildSKPFromSources` + DB loader `buildSKP`.
3. Add `skpToPublicDto` / `skpToJsonLd` (consumers later).
4. Map Mission 001 `REAL|INFERRED|GENERATED|UNKNOWN` → `ProvenanceTag`.
5. Unit tests with fixtures (no live DB required for gate).

## Process classification

| Question | Answer |
|----------|--------|
| Changes publish / customer messaging / billing? | No |
| Changes public DTO contract? | No (Phase 1) |
| Requires user confirmation governance? | No (analysis / internal projection) |
| Writes Business.publishedAt / User / BusinessSeed? | **No** (read-only) |

## Proceed

Phase 1 is **LOW risk / additive**. Implementing now.
