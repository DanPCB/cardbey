# Impact Report: Real Menu Extraction + Multi-Image Import

**Date:** 2026-07-15  
**Scope:** Replace with my menu (store draft preview) → extract → review → catalog replace  
**Constraint:** No catalog write before owner review; runtime authority for apply; no hardcoded Core URL in React

## Audit findings (production)

| Item | Finding |
|------|---------|
| UI | `MenuUploadModal` in `postBuildInlineUi.tsx` (“Replace with my menu”) |
| Request | `POST https://cardbey-core.onrender.com/api/stores/temp/draft/extract-menu` |
| Method | Multipart `FormData` (`file`, `generationRunId`, `language`) |
| Auth | Bearer + `credentials: 'include'` (`apiPOST` / `apiFetch`) |
| Topology | **Browser → Core absolute URL** (static `cardbey.com` has no `/api` BFF; `_redirects` is SPA-only) |
| Core handler | `stores.js` `POST /:storeId/draft/extract-menu` → `extractMenuFromFile` (sync LLM) |
| Catalog apply | Separate `PATCH .../draft/catalog` after “Use these items” (already gated by review) |
| Multi-file | **No** — single `input` / multer `.single('file')` |
| Error wrap | Any `NetworkError` / `Failed to fetch` → “Unable to connect… ensure Cardbey Core is running” |

## Root cause (most likely)

Not “Core is down.” Failure is **browser-direct cross-origin sync extraction**:

1. Production `buildApiUrl` always targets absolute Core (`cardbey-core.onrender.com`).
2. Extraction holds the HTTP request open for the full vision/LLM run (often longer than Render/proxy/browser limits) → connection drop → Firefox `NetworkError when attempting to fetch resource`.
3. Misleading generic network wrap hides timeout / proxy / CORS vs true unreachable Core.
4. Path is not under `/upload/`, so it does not use the hero-style **minimal CORS header** path that production upload flows already rely on.
5. One-shot single-file design cannot support front/back menus or multi-page PDFs.

CORS whitelist already includes `https://cardbey.com`. Same-origin `/api/menu-import` on `cardbey.com` is **not available** without a new edge BFF (static Render site). Remediation follows the proven **runtime multipart upload** pattern (`upload-hero`) + **async job + poll**, server-side to Core.

## What could break

1. **Single-file sync callers** of `extractDraftMenuFromFile` / `POST .../extract-menu` if we remove them without a shim.
2. **Review UX timing** if UI expects immediate items instead of poll.
3. **Catalog patch** if apply path changes payload shape without mapping.
4. **File size** if clients send > existing 10MB before limits are raised carefully.

## Smallest safe patch (this change set)

1. Add durable `MenuImportJob` (draft-preview JSON + S3 asset keys; no Prisma migration).
2. Add `POST /api/performer/runtime/ui-action/upload-menu-import` (multi-file, 202 + jobId).
3. Background extract per asset → merge → `needs_review`; `GET` job status for poll.
4. Dashboard: multi-file tray, upload → poll, typed errors, keep review before apply.
5. Apply remains existing `replace_catalog` / `PATCH .../catalog` after owner confirm.
6. Keep legacy `extract-menu` as thin sync shim or redirect into the job path for compatibility.
7. Expand minimal-CORS allowlist for menu-import / extract-menu paths.
8. Improve vision schema/prompt for packages, durations, add-ons, contact/hours metadata (non-catalog).

## Implementation status (2026-07-15)

### Shipped in this change set

| Area | Change |
|------|--------|
| Upload path | `POST /api/performer/runtime/ui-action/upload-menu-import` (multipart `files`, 202 + `jobId`) |
| Job poll | `GET /api/performer/runtime/menu-imports/:jobId?generationRunId=` |
| Persistence | Job mirrored on `DraftStore.preview.menuImportJobs`; assets via S3 (`artifacts`) |
| Extraction | Background `setImmediate` per asset → merge → `needs_review` |
| UI | Multi-file tray, progress phases, replace/merge choice, review before Apply |
| Errors | Typed `MENU_*` codes; no “ensure Core is running” for menu paths |
| CORS headers | Minimal header set for menu-import / extract-menu (same as hero uploads) |
| Runtime | `UPLOAD_ACTIONS.IMPORT_MENU = 'import_menu'` |
| Catalog apply | Still existing review → `replace_catalog` / `PATCH .../catalog` (no pre-approval overwrite) |

### Not same-origin BFF

`cardbey.com` is a static Render site (`_redirects` → SPA). True `Browser → cardbey.com/api → Core` requires an edge worker (follow-up). Production continues absolute Core with runtime multipart + async job (same proven pattern as hero upload).

### Remaining risks

- Mid-extraction Core restart drops in-memory buffers (job may stick in `extracting` until timeout/retry).
- Merge apply mode is selected in UI; catalog PATCH may still fully replace items until merge write path is completed.
- Contact/hours metadata is shown in review when present but not auto-written to store profile.
- Production verification requires deploying **both** Core and dashboard matching this contract version (`1`).
