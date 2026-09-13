# Impact Report — QA Review enrichment wrong batchId

## What could break
- Enrichment confirm text and inventory lookup for Melbourne pilot
- Multi-market QA enrich when batch card is not selected

## Why
`handleRunEnrichment` used `selectedBatchId ?? batchFromUrl ?? MELBOURNE_BATCH001_REAL_LOCAL`. Selecting MM_VN rows without an active batch filter still defaulted to Melbourne → `INVENTORY_EMPTY`.

## Impact scope
- `QaReviewPage.tsx` enrich batch resolution only

## Smallest safe patch
Resolve enrich `batchId` from scoped candidates when UI batch filter is unset; refuse mixed-batch enrich with a clear alert.
