# Impact report — Discovery Agent Diagnostics V2

**Date:** 2026-08-10  
**Target verdict:** `DISCOVERY_AGENT_DIAGNOSTICS_V2_READY`

## Live root causes (from code + run semantics)

| Source | Evidence | Classification |
|--------|----------|----------------|
| Google `google_maps` value=`Nails and beauty services` | Resolver only accepts `http*` Place URLs; free-text returns `[]` → counted as failed. **No Places API call.** | `CONFIG_ERROR` / `INVALID_SOURCE` |
| TikTok `tiktok_hashtag` | Tag page fetch via datacenter HTTP; empty/blocked HTML → `no_urls_resolved` | `PROVIDER_BLOCKED` |
| TikTok `url_list` | Skips discovery; feeds profile URLs into `processUrl` | Works (`SUCCESS` path) |

## What could break

1. Batch `errorLog` shape gains fields (`code`, `retryable`, …) — old UI must tolerate extras.
2. Cron may skip permanently misconfigured/blocked seeds (cooldown) — fewer wasted runs.
3. “Today X / Y” copy changes meaning clarity (display only; quota formula unchanged initially).

## Impact scope

- Core: `lib/discovery/diagnostics/**`, `DiscoveryBatchRunner.js`, `discoveryRoutes.js` seed/batch enrichment
- Dashboard: `DiscoveryControlPanel.tsx`, `discoveryAdminApi.ts`
- No URI Federation, no Universal Library, no second scheduler, no schema migration

## Smallest safe patch

Structured result codes in `errorLog` + `configSnapshot.result`; compute source health from recent batches; UI Health / Last Result / details drawer; cron cooldown for non-retryable codes.
