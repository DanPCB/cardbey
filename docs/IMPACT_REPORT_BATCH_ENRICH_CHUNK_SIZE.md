# Impact Report — Batch enrich stuck on 10 candidates

## What could break
- QA Review enrich duration / progress UX
- Batch enrich hourly rate limit (more HTTP calls if we chunk smaller)
- Server long-running timeout for enrich

## Why
One request enriches candidates **sequentially** (~20–30s each). Chunk size was **25**, so 10 hotels ≈ **4+ minutes** in one HTTP call. Latency guard long-running cap is **120s** → 408 mid-batch → UI stuck on “Enriching…” / NetworkError. Single-candidate runs stay under 120s.

## Impact scope
- Dashboard `QaReviewPage` chunk size + progress
- Core rate limit / optional enrich-specific timeout headroom

## Smallest safe patch
1. Live (and dry-run) enrich in **chunks of 1** with existing progress label.
2. Raise batch-enrich rate limit (e.g. 20 → 60/hr) so a 10-row batch does not burn the quota.
3. Keep 120s long-running timeout (sufficient per chunk of 1).
