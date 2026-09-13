# Impact Report — Fix PUBLISHED_STORES_BACKFILL enrichment ENRICHMENT_ERROR

## Step 1 finding (exact failure)
- `ENRICHMENT_ERROR` is set only in the **catch** of `enrichCandidateMultiSource` (`multiSourceEnrichmentAgent.ts` ~L1125), not by a status/ID allowlist.
- There is **no** validation rejecting `published:` IDs or `NEEDS_ENRICHMENT` before sources run.
- Immediate throw (~1–3ms, `sourcesUsed: []`) matches:
  `candidate.socialLinks.find(...)` when `socialLinks` is `null`/`undefined` (TypeError).
- Accepted lifecycle statuses (types): includes `PENDING_QA`, `CLAIMABLE`, … — **not** `NEEDS_ENRICHMENT` (invalid for typing/UI, but not the 3ms crash).

## What could break
- Enrichment for candidates missing `socialLinks`
- Business rows when `storeId` write-back runs (must not overwrite with nulls/placeholders)
- Backfill candidate JSON repair on Render ephemeral disk

## Smallest safe patch
1. Guard `socialLinks` (and similar) with `?? []` in the agent.
2. After successful enrich, write non-empty contact/hours/description/hero back to Business when `storeId` set.
3. Repair script: set `socialLinks: []`, status `PENDING_QA`, keep `storeId`; optionally normalize id (optional — not required for crash).
4. Unit test: null `socialLinks` must not yield `ENRICHMENT_ERROR` from TypeError.
