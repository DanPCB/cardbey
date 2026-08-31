# Audit — TikTok hashtag discovery (`no_urls_resolved`)

**Date:** 2026-08-09  
**Verdict:** `TIKTOK_HASHTAG_PROVIDER_BLOCKED`

## 1. Exact failing path

| Field | Value |
|-------|-------|
| FILE | `src/lib/discovery/DiscoveryBatchRunner.js` |
| FUNCTION | `runBatch` (after `resolveUrlsFromSeed` → `resolveTikTokHashtag`) |
| INPUT | `DiscoverySeedSource { type: tiktok_hashtag, value: bakery }` |
| EXPECTED | Candidate `https://www.tiktok.com/@…` URLs, or honest `NO_RESULTS` / `PROVIDER_BLOCKED` |
| ACTUAL (before fix) | `urls=[]` → `failed:1` + opaque `no_urls_resolved` |
| FAILURE CONDITION | Tag page HTML contains no `@handle` links (bot/MSSDK shell) |

Call chain:

`DiscoveryScheduler.onTick` → `runAllActive` → `runBatch` → `resolveUrlsFromSeed` → `resolveTikTokHashtag` → (empty) → previously `no_urls_resolved`.

## 2. What TikTok returned (local probe)

`GET https://www.tiktok.com/tag/bakery`

- HTTP **200**, `text/html`, ~380KB  
- Title: `TikTok - Make Your Day`  
- MSSDK / webmssdk present  
- `__UNIVERSAL_DATA_FOR_REHYDRATION__` with app/i18n context only; `vidList: []`  
- **0** profile hrefs, **0** `uniqueId` values  

**Classification:** `BOT_SHELL` / challenge shell — **not** a fragile selector miss.

Same pattern for `melbournebakery`.

## 3. Why `url_list` differs

| | `tiktok_hashtag` | `url_list` |
|--|------------------|------------|
| Resolve | Fetch TikTok `/tag/{h}` HTML | Parse seed JSON / single URL |
| Network for discover | Yes (blocked shell) | No |
| Next | `processUrl` | `processUrl` |

Direct profile URLs skip hashtag discovery; scrape may still succeed via OpenGraph on `@user` pages (separate path).

## 4. Skip semantics (`discovered:1 skipped:1`)

In `processUrl`: scrape OK → `UnclaimedStoreService.upsertFromPayload` → `existed: true` → `skipped++` without `scraped++`.  
**Legitimate duplicate** — discovery worked; candidate correctly rejected.

## 5. Scheduler / quota

- One scheduler tick → `runAllActive` → **one `DiscoveryBatchRun` per active seed** (same `runSessionId`).  
- `maxRunsPerDay` / “Today: X” counts **`DiscoveryBatchRun` rows** (`completed|partial|running` since start of day), **not** ticks and not per-URL.  
- Behavior left unchanged.

## 6. Provider strategy (locked)

Do **not** bypass TikTok anti-bot.

Staging previously added an optional Puppeteer retry on empty tag HTML — removed in this fix (brittle / policy-violating for this surface). Profile scrape via `TikTokAdapter` may still use Puppeteer when `SOCIAL_IMPORT_PUPPETEER=true` for **direct** `@user` URLs only.

Operational TikTok discovery:

`url_list` of canonical `@profile` URLs → existing `processUrl` → `TikTokAdapter` → Unclaimed / PreBuilt.

`tiktok_hashtag` server crawl remains available if TikTok ever returns SSR profiles; otherwise records `PROVIDER_BLOCKED` with `failed: 0`.

## 7. Fix applied

- `tiktokHashtagResolver.js` — classify + extract + structured statuses  
- `DiscoveryBatchRunner` — stop treating `PROVIDER_BLOCKED` / `NO_RESULTS` as `failed: 1` / `no_urls_resolved`  
- Tests for resolver + seed resolve  
