# Assets Photo Search: Relevant Results for Query

## Problem

In the Content Studio **Assets** panel (Photos tab), searching for a term like **"rose"** was returning irrelevant images (e.g. stone structure, couple on beach) instead of photos matching the query.

## Root cause

- **Core** `GET /api/assets/photos` used only a **static curated list** of ~12 images.
- The query `q` was used only to **rank/filter** that small list (by tags/author). The list did not contain enough variety, and in some environments the list or routing could produce unrelated results.
- There was **no call to the Pexels API** with the user's search term, so real search results were never returned.

## Fix (additive, no breaking changes)

**File:** `apps/core/cardbey-core/src/routes/assets.js`

1. **Live Pexels search when configured**
   - If `PEXELS_API_KEY` is set **and** the request includes a non-empty `q`, the handler now calls `https://api.pexels.com/v1/search` with that query and returns the API results in the same response shape the dashboard expects.
   - Supports `page`, `perPage`, and optional `orientation` (landscape | portrait | square).

2. **Fallback unchanged**
   - If the key is not set or Pexels fails (e.g. rate limit), the route falls back to the existing static list and query-based ranking so the UI never breaks.

3. **Response shape**
   - Pexels API photos are mapped to the existing dashboard `PexelsPhoto` shape (`id`, `thumbUrl`, `fullUrl`, `photographer`, `attributionText`, `alt`, `tags`, etc.) so no frontend changes are required.

## What you need to do

1. **Set `PEXELS_API_KEY`** on the Core server (same env used by menu visual agent / Pexels service).  
   Then a search for **"rose"** (or any term) will return **real Pexels results** for that query.

2. **Ensure the dashboard talks to Core** for `/api/assets/photos` (via `getEffectiveCoreApiBaseUrl()` and proxy or same-origin).  
   If the dashboard hits Core, you get either live Pexels results (when key is set) or the static list.

## Optional: client-side relevance filter

The dashboard client (`apps/dashboard/cardbey-marketing-dashboard/src/lib/api/assets.ts`) already has a light **filter** that removes photos containing terms like "office", "laptop", "desk" from the results. It does **not** filter by query match so that backend (or Pexels) remains the source of relevance. No change required there for this fix.

## Checklist

- [ ] Core: `PEXELS_API_KEY` set when you want live search.
- [ ] Core: `GET /api/assets/photos?q=rose&page=1&perPage=24` returns Pexels results when key is set.
- [ ] Dashboard: Assets panel shows relevant photos for "rose" (and other queries) when Core is used with the key.
