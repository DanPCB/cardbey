# Impact Report: deploy_version_mismatch false positive

**Date:** 2026-07-27  
**Companion:** dashboard `docs/IMPACT_REPORT_DEPLOY_VERSION_MISMATCH_FALSE_POSITIVE.md`

## What could break

1. Real skew detection if we stop comparing SHAs entirely.
2. Build fails if env bake is wrong (unlikely — falls back to `git rev-parse` / `unknown`).

## Why

Parent Render static build did not force `VITE_APP_COMMIT_SHA` to monorepo HEAD; Vite inside the submodule baked dashboard-repo SHA. Core exposes monorepo `RENDER_GIT_COMMIT` → permanent false mismatch.

## Impact scope

- `scripts/render-dashboard-static-build.mjs` only (env bake before dashboard build).
- Handshake logic lives in dashboard (absolute Core URL + parent SHA compare).

## Smallest safe patch

Set `VITE_APP_COMMIT_SHA` / `VITE_PARENT_COMMIT_SHA` from `RENDER_GIT_COMMIT` or parent `git rev-parse HEAD` before `pnpm --filter @cardbey/dashboard run build`.

## No-parallel-stack proof

Same Render build script; no second version service.
