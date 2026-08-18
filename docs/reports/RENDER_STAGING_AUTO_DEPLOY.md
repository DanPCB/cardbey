# Render staging auto-deploy mapping (read-only)

**Date:** 2026-08-15  
**Authorization:** record only. Do **not** change Render settings. Do **not** merge to `staging` while auto-deploy remains active under the current no-deployment ACK.

## Services that watch `staging`

| Render service | Repo | Branch in Blueprint | Auto-deploy |
|----------------|------|---------------------|-------------|
| `cardbey-core-staging` | `DanPCB/cardbey` | `staging` (`render.yaml` line 7) | **Yes** (Blueprint omits `autoDeploy`; Render default is on). Documented in `docs/DEPLOYMENT_PROMOTION.md`. |
| `cardbey-dashboard-staging` | `DanPCB/cardbey` | `staging` (`render.yaml` line 90) | **Yes**, same default. Dashboard copy `apps/dashboard/.../render.yaml` sets `autoDeploy: true` on its staging service. |

Merging **any** monorepo PR into `staging` triggers git-source builds of both staging services. That is a live staging deploy (including Core `prestart` → `migrate deploy`).

Production (`main` → `cardbey-core` / `cardbey-dashboard`) is a separate auto-deploy pair. Not touched here.

## Can an administrator suspend deploy?

Yes, in the Render dashboard only (not done here):

- Per service: **Settings → Auto-Deploy → Off** (or suspend the service).
- Blueprint `autoDeploy: false` would persist in git; that is a settings change and is **out of scope**.

## Non-deploying integration branches

| Ref | Deploys Render staging? |
|-----|-------------------------|
| `staging` | **Yes** |
| `main` | Production services, not staging |
| `dev` / `develop` | CI only in this repo’s docs; no staging service `branch` |
| `release/live-market-global-live-stg` | No staging service watches it |
| PR branches (`fix/staging-ci-runway-live-market`, `feat/cloudflare-stream-rtmps-pilot-v3`, …) | **No**, unless a Render service is pointed at them |

Safe integration without staging deploy: keep PRs open against `staging` or stacked on `fix/staging-ci-runway-live-market`. **Do not merge.**
