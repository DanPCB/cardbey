# Audit — Cardbey Originals empty previews on live Universal Library

**Date:** 2026-08-09  
**Verdict (pre-deploy):** `CARDBEY_ORIGINALS_MEDIA_DELIVERY_BLOCKED` until production Core/Dashboard deploy + smoke GET on live preview URLs.  
**Code fix status:** Implemented — absolute Core media URLs + card resolution + `/videos` static + optional S3 durable import + repair script.

## Trace summary

| Sample | Provider | preview shape | Browser host if relative | Expected |
|--------|----------|---------------|--------------------------|----------|
| A Working Pexels | pexels REFERENCE | `https://images.pexels.com/...` | CDN | Renders |
| B Working Original (when Core has file) | cardbey_internal HOSTED | `/assets/ai-backgrounds/...` | **was dashboard** → 404 | After fix → Core origin |
| C Broken Original / seed | cardbey / fixtures | null or missing `/videos/...` | N/A / 404 | Icon + “Preview unavailable” |

## Primary classification

**D — relative URL resolved against wrong host** (dashboard), with **G — missing uploaded object** for untracked Originals videos under `public/videos`.

Not: rights, ResourceCard provider hacks, or fixture reintroduction.

## Storage path (canonical)

1. Preferred: S3/R2 via existing `uploadBuffer` when `STORAGE_DRIVER=s3` (importer writes durable HTTPS).  
2. Fallback: Core static `public/assets` + `public/videos` served at `/assets` and `/videos`, with public DTO absolutized via `CORE_PUBLIC_URL` / `PUBLIC_API_BASE_URL`.

Dashboard must **not** be the durable host for catalogue binaries.

## Importer / repair

- `cardbeyOriginalsImport.js` — optional durable upload; upgrade-in-place by `manifestId`.  
- `scripts/repair-cardbey-originals-media.mjs` — re-import upgrade + inventory JSON.

## Ops after merge

1. Deploy Core + Dashboard to production.  
2. Ensure `CORE_PUBLIC_URL` (or `PUBLIC_API_BASE_URL`) is the public Core API origin.  
3. Copy any missing Originals videos into Core `public/videos` (or rely on S3 upload).  
4. Run: `node scripts/repair-cardbey-originals-media.mjs` against prod DB.  
5. Hard-refresh `https://cardbey.com/library` and GET sample preview URLs (expect 200).

## Live inventory

Produce from repair script output (`byType` / `readiness`) after step 4 — not guessed offline.
