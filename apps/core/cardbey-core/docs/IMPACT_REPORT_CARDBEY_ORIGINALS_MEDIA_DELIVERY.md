# Impact Report — Cardbey Originals media delivery (Universal Library)

**Date:** 2026-08-09  
**Scope:** HOSTED Originals preview/media URLs for public `/library`  
**Ontology:** Resources (Universal Library) — no new product space

## Root cause (primary)

**D — relative URL resolved against wrong host** (dashboard origin), with secondary **G — missing object** for untracked `/videos/*`.

| Working (Pexels) | Broken (many Originals) |
|------------------|-------------------------|
| Absolute `https://images.pexels.com/...` | Relative `/assets/...` or `/videos/...` |
| Browser loads CDN | Browser loads `cardbey.com/assets/...` → 404 → grey card |

API returns relative HOSTED paths; `ResourceCard` did not call `resolveCoreMediaUrl`. Core serves `/assets` but not `/videos`.

## What could break

1. Absolute Core URLs may fail if `CORE_PUBLIC_URL` / `PUBLIC_API_BASE_URL` unset in an env (falls back to relative).
2. Cross-origin image loads need Core CORS (already `Access-Control-Allow-Origin: *` on `/assets`).
3. S3 upload path during import only when `STORAGE_DRIVER=s3` — local/dev unchanged.

## Smallest safe patch

1. Absolutize relative HOSTED media in `toPublicAssetView` via Core public base.
2. Dashboard: `resolveCoreMediaUrl` on card/detail posters + intentional `onError` fallback.
3. Mount Core `express.static` for `/videos`.
4. Importer: optional durable upload when S3 configured; repair script for existing rows.
5. Public `previewReadiness` (not rightsStatus).

## Non-goals

Fake Pexels thumbs, fixture reseed, rights/URI changes, Originals-only ResourceCard hacks.
