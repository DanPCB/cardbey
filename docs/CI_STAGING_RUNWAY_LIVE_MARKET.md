# CI runway — staging foundation (monorepo)

## Problem
Live Market / staging PRs were failing CI with three root causes that also reproduced on the base tip:

1. **tsx** — `vitest.config.js` hard-coded monorepo-root `node_modules/tsx`, while CI installs deps under `apps/core/cardbey-core` (`npm ci`) or pnpm without root hoist.
2. **Dashboard submodule** — workflows used `actions/checkout@v4` without materializing the private dashboard submodule. Naive `submodules: recursive` from the **public** parent also fails: default `GITHUB_TOKEN` cannot clone the **private** dashboard.
3. **Prisma shadow DB** — `prisma migrate diff --from-migrations` requires `--shadow-database-url`.

## Actions secret name (verified)

GitHub Actions **rejects custom secrets whose names start with `GITHUB_`**.

| Scope | Name present | Used by workflows |
|-------|--------------|-------------------|
| `DanPCB/cardbey` repository Actions secrets | `CARDBEY_SUBMODULE_TOKEN` | yes |
| `DanPCB/cardbey` repository Actions secrets | `GITHUB_SUBMODULE_TOKEN` | **not creatable** (reserved prefix) |
| Repository Environments | none | n/a |

Workflows map `secrets.CARDBEY_SUBMODULE_TOKEN` into `CARDBEY_SUBMODULE_TOKEN` and the Render/local alias `GITHUB_SUBMODULE_TOKEN` for `scripts/init-private-dashboard-submodule.mjs`. Presence is logged as `secret_present=true|false` only.

## Fix (this branch)
- Resolve `tsx` from `@cardbey/core` `node_modules` first (`vitest.config.js`).
- Materialize the dashboard via the init script + `CARDBEY_SUBMODULE_TOKEN`, then assert gitlink SHA.
- Core-only jobs do **not** require the private submodule.
- Ephemeral `cardbey_shadow` for migrate-diff; `migrate deploy` on empty `cardbey_test`.
- Build Artifact: init private submodule; PR builds images **without cache and without push**; push-to-staging may use gha cache only after a no-cache PR build succeeds.
- Core Docker context is the **monorepo root** so `npm ci` can resolve `file:../../../packages/template-engine` (lockfile unchanged).
- Render readiness treats `foo.js` server imports as satisfied by `foo.ts` (tsx boot).
- Dashboard i18n is a **separate no-new-debt job** (audited baseline 2553; historical target 1213 unpaid). Vitest + production build still run independently.

## Dashboard standalone PRs
https://github.com/DanPCB/cardbey-marketing-dashboard/pull/103 adds `.github/workflows/pr-checks.yml`.

## Out of scope
RTMPS product code, Render secrets, Cloudflare, schema/migrations content repairs.

## Known remaining
- **i18n no-new-debt:** parent ratchet pins audited **2553** (`scripts/i18n-debt-baseline.json`). Historical target **1213** remains unpaid and visible. See `docs/reports/I18N_TRANSLATION_DEBT_STAGING.md`.
- **Render:** merging to `staging` auto-deploys `cardbey-core-staging` and `cardbey-dashboard-staging`. See `docs/reports/RENDER_STAGING_AUTO_DEPLOY.md`. Do not merge under the current no-deploy ACK.
- **`BLOCKED_PRISMA_MIGRATION_CHAIN`:** migrate-diff remains an honest failing **deployment** gate. Template Library catch-up is PR **#144** (do not merge yet). Commerce/POS is planning-only: `docs/reports/IMPACT_REPORT_PRISMA_PG_COMMERCE_POS_CATCHUP.md`.
- Full core Vitest on staging tip has pre-existing product failures after tsx is fixed. Live Market suite is the runway gate.
- RTMPS PRs #102 / #139 are **not** merged by this work.
