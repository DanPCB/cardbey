# Impact Report — Admin "Run enrichment" CTA

**Generated:** 2026-08-24  
**Request:** Add Run enrichment on Growth Command / QA Review calling batch enrich from admin UI.

## What could break

| Risk | Why |
|------|-----|
| Render HTTP timeout on live enrich | Multi-source enrich is sequential + web fetches; long batches can exceed request timeout |
| Accidental live mutate of candidates | Admin CTA could write heroes/descriptions without dry-run |
| Protected Batch 0 enrich | Must refuse `MELBOURNE_BATCH0_20260617` |
| Empty inventory | Ephemeral `candidates.json` → `INVENTORY_EMPTY` until discovery re-run |
| Report write on Render | Writing `docs/reports/*` may fail on read-only FS |

## Impact scope

- Core: new admin route `POST /api/business-candidates/batch/enrich`
- Dashboard: Growth Command Center + QA Review buttons
- No change to public claim cards, discovery fetch, or auto-approve

## Smallest safe patch

1. Admin route wrapping `runMultiSourceEnrichmentBatch` with `requireAdmin`, rate limit, protected-batch refusal, `writeReport: false`, `maxCandidates` capped at 25 (UI default 5).
2. UI defaults to **dry run**; live requires confirm.
3. QA Review enriches **selected** candidates when selection non-empty; otherwise filtered batch (capped).
4. No post-ingest auto-enrich; no QA approve blocking.

## Proceed

Implementing the above; no unrelated routes/auth/contracts changed.
