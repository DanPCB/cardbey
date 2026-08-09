# Impact Report — TikTok hashtag discovery (`no_urls_resolved`)

**Date:** 2026-08-09  
**Scope:** Content Discovery Agent seed type `tiktok_hashtag` only  
**Out of scope:** Discovery Agent redesign, diagnostics UI, URI / Universal Library

## What could break

1. Run History rows that previously showed `failed: 1` + `no_urls_resolved` for blocked hashtag crawls may instead show `failed: 0` with diagnostic `PROVIDER_BLOCKED` / `NO_RESULTS` — operators must read `errorLog` / `lastError`.
2. Seeds that depended on brittle HTML `@` regex succeeding on SSR content will not magically start creating stores (TikTok no longer embeds profiles in server HTML).
3. Daily quota (`maxRunsPerDay`) unchanged — still counts `DiscoveryBatchRun` rows, not ticks.

## Why

Live/local probe of `https://www.tiktok.com/tag/bakery` returns HTTP 200 HTML (~380KB) with MSSDK / challenge shell, generic title “TikTok - Make Your Day”, `__UNIVERSAL_DATA_FOR_REHYDRATION__` containing app/i18n context only (empty `vidList`), **zero** `@handle` hrefs and **zero** `uniqueId` values. `fetchHtml` + regex therefore returns `[]` → `runBatch` sets `failed: 1` with opaque `no_urls_resolved`.

## Impact scope

- `DiscoveryBatchRunner` resolve + batch counters / errorLog
- New `tiktokHashtagResolver` module
- Admin Run History interpretation for TikTok hashtag seeds
- **Unchanged:** `url_list` → `processUrl` → `TikTokAdapter` / UnclaimedStore / PreBuilt

## Smallest safe patch

1. Classify TikTok tag responses; map empty resolve to `PROVIDER_BLOCKED` / `NO_RESULTS` / `NETWORK_ERROR` / etc. (not generic `no_urls_resolved` failure).
2. Do not treat provider-blocked / zero-results as `failed: 1`.
3. Document operational strategy: use `url_list` profile URLs; do not bypass TikTok anti-bot.
4. Unit tests with fixture HTML (no live TikTok dependency in CI).
