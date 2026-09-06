# Impact Report — MM QA batch cards: inventory vs job Discovered

## What could break
- Multi-market QA Review batch card numbers (Discovered / Pending QA)
- Default selected batch when opening QA Review (with or without `?batchId=`)
- Growth → Open QA Review deep link to a just-finished empty live job

## Why
Cards used `max(job.discoveredCount, candidate metrics.total)` for Discovered, so empty inventory still showed provider hits. Newest empty live jobs hijacked selection while older batches still held PENDING_QA rows.

## Impact scope
- Core: `listMultiMarketQaBatches` metric + sort
- Dashboard: `BatchCards` label clarity; `QaReviewPage` auto-select highest pending when current selection is empty inventory

## Smallest safe patch
1. Card `discovered` = persisted candidate total only; expose `providerHits` from job for optional secondary label.
2. Sort MM cards by `pendingQa` desc (then live over dry-run, then recency).
3. After MM batches load: if selected/`?batchId=` has `pendingQa === 0` and another batch has `pendingQa > 0`, select the highest once per load (user can still click an empty card afterward).
