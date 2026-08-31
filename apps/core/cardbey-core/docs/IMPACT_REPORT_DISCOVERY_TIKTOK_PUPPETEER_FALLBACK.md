# Impact Report — Discovery TikTok URL resolve puppeteer fallback

**Date:** 2026-08-08  
**Status:** Proceeding — opt-in only

## What could break

Longer Core CPU / timeouts on Render if `SOCIAL_IMPORT_PUPPETEER=true` and TikTok still blocks headless Chrome.

## Why

Plain `fetchHtml` on TikTok tag pages from datacenter IPs often returns shell HTML with zero `@` profile links → `no_urls_resolved` in ~0s.

## Impact scope

`resolveUrlsFromSeed` for `tiktok_hashtag` only. Reuses existing `renderHtmlWithBrowser` (no-op unless env enabled).

## Smallest safe patch

After HTTP extract yields no URLs, call `renderHtmlWithBrowser` once; still return `[]` if empty (honest failure, no fake stores).

## No-parallel-stack proof

Same DiscoveryBatchRunner + scrapeUtils path; no alternate crawler product.
