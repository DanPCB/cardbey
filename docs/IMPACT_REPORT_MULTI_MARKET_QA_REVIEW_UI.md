# Impact Report — Multi-market QA Review UI

## What could break
- QA Review empty-state / count display when filtering by batch
- Multi-market live ingest candidate status (DISCOVERED → PENDING_QA)

## Why
MM batches were not listed in Pilot batches; dry-run jobs leave QA empty; summary showed “0 of 10” using Melbourne totals.

## Impact scope
- `QaReviewPage`, `BatchCards`, `MultiMarketDiscoveryPanel`
- Core: multi-market batch list API + ingest status

## Smallest safe patch
1. List MM batches as QA cards (reuse BatchCards)
2. Sync `?batchId=` on select; Open QA link from Growth panel
3. Ingest MM candidates as `PENDING_QA`
4. Batch-local summary counts (no cross-batch “of 10”)
