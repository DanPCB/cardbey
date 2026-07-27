# Impact Report — Language Agent missing `i18n.js` on Render

**Date:** 2026-07-16  
**Symptom:** `POST /api/language/scan` → `500 i18n file not found: …/apps/dashboard/cardbey-marketing-dashboard/src/i18n.js`

## What could break

1. Core **build time** increases slightly if the dashboard submodule is initialized during `render-build`.
2. Runtime **fetch fallback** (if submodule still missing) depends on GitHub/raw access; private repos need `GITHUB_TOKEN` / `GH_TOKEN`.
3. **Hardcoded-string detect** (`i18n-detect.mjs`) still needs a full dashboard tree — without submodule it soft-fails (already caught); Vietnamese/parity scan can still succeed from `i18n.js` alone.
4. **Apply/rollback on live Render** still writes only the container filesystem — it does **not** ship fixes into the live static dashboard deploy or GitHub. That is pre-existing; this fix restores scan/preview, not git publish.

## Why

- `cardbey-core` Render `rootDir` is `apps/core/cardbey-core`.
- `getDashboardPackageRoot()` walks to the monorepo and targets the dashboard submodule path.
- Core’s `render-build.mjs` never runs `git submodule update --init`, so the submodule directory is empty on live.
- Dashboard static services *do* init the submodule; core did not.

## Impact scope

- `POST /api/language/scan` (and apply paths that read/write `i18n.js`)
- Control Center → Language Fix Review
- Core Render build script only (no customer storefront publish path)

## Smallest safe patch

1. Init dashboard submodule in `apps/core/cardbey-core/scripts/render-build.mjs` (non-fatal if blocked).
2. Commit `data/language-seed/` (`i18n.js` + glossary) as always-present core fallback (raw GitHub 404s for private repo).
3. Harden monorepo root discovery; `ensureDashboardI18nReady()` prefers submodule → seed → optional raw fetch.
4. Call ensure at the start of `LanguageAgent.scan` (and apply path).
5. Surface scan errors in the dashboard Language Fix Review UI (no unhandled rejection).
6. Refresh seed after catalog edits: `node apps/core/cardbey-core/scripts/sync-language-seed.mjs`.

## Deploy note

Requires a **cardbey-core** redeploy after merge. Dashboard UI fix needs a dashboard deploy for the error banner; scan itself is fixed by core alone.
