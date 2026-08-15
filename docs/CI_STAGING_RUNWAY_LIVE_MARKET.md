# CI runway — staging foundation (monorepo)

## Problem
Live Market / staging PRs were failing CI with three root causes that also reproduced on the base tip:

1. **tsx** — `vitest.config.js` hard-coded monorepo-root `node_modules/tsx`, while CI installs deps under `apps/core/cardbey-core` (`npm ci`) or pnpm without root hoist.
2. **Dashboard submodule** — workflows used `actions/checkout@v4` without materializing the private dashboard submodule, so `deploy-render-readiness` and dashboard jobs saw an empty path (or walked up to the root `package.json`). Naive `submodules: recursive` from the **public** parent also fails: default `GITHUB_TOKEN` cannot clone the **private** dashboard (`repository not found`).
3. **Prisma shadow DB** — `prisma migrate diff --from-migrations` requires `--shadow-database-url` on current Prisma; CI only provisioned one disposable Postgres DB.

## Fix (this branch)
- Resolve `tsx` from `@cardbey/core` `node_modules` first (`vitest.config.js`).
- Materialize the dashboard via `scripts/init-private-dashboard-submodule.mjs` + `GITHUB_SUBMODULE_TOKEN` (established secret name; never embed the value), then assert gitlink SHA with `scripts/ci-assert-dashboard-submodule.mjs`.
- Core-only jobs (Vitest / Prisma gold) do **not** require the private submodule.
- Ephemeral `cardbey_shadow` DB for migrate-diff only; `migrate deploy` against empty `cardbey_test`.
- Enable `staging` branch triggers for the repaired workflows.

## Required GitHub Actions secret
On `DanPCB/cardbey` (Actions → Secrets), set:

| Name | Purpose |
|------|---------|
| `GITHUB_SUBMODULE_TOKEN` | Fine-grained or classic PAT with **read** access to private `DanPCB/cardbey-marketing-dashboard` |

Without it, dashboard-dependent jobs fail fast with the existing init-script message. Core Vitest / Prisma contract jobs still run.

## Dashboard standalone PRs
`DanPCB/cardbey-marketing-dashboard` previously ran Golden Flows only on `main`/`master`, so PRs such as #102 reported **no checks**. That is not CI success.

Standalone fix PR: https://github.com/DanPCB/cardbey-marketing-dashboard/pull/103 (`fix/ci-pr-checks-live-market`) adds `.github/workflows/pr-checks.yml` (Live Market Vitest + production build, Node 20).

Until that lands, manual merge gate for dashboard product PRs:

```bash
cd apps/dashboard/cardbey-marketing-dashboard
pnpm install --frozen-lockfile || pnpm install
pnpm exec vitest run src/lib/liveMarket src/components/liveMarket src/pages/dashboard/StoreLiveMarketPage.test.tsx --pool=forks
pnpm run build
```

## Out of scope
RTMPS product code, Render secrets, Cloudflare, schema/migrations content.

## Known remaining (separate from this repair)
- **Build Artifact** on `staging`: Docker `cache-to: type=gha` without buildx setup; dashboard image still needs submodule auth.
- RTMPS PRs #102 / #139 are **not** merged by this work.
