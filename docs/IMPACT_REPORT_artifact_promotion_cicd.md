# Impact Report: Immutable Artifact Promotion (dev → staging → live)

Date: 2026-06-06
Scope: CI/CD + deploy method (potentially changes how production is built and released)
Status: **Proposal — awaiting confirmation before any high-risk change**

## Goal

Move cardbey toward the industry-standard **build-once / promote-the-same-artifact**
pattern (Netflix/Etsy/Google style): one immutable build per commit, deployed
unchanged to dev → staging → live, with environment config injected externally.

## Current state (as-is)

- **Hosting:** Render.com PaaS, native git-branch builds (no Docker).
- **Promotion:** `git merge` across branches `dev → staging → main`.
- **Build:** Render **rebuilds from source independently** per branch
  (`render.yaml` core lines 10/83, dashboard 60/121). There is **no single artifact**.
- **CI (GitHub Actions):** runs **tests only** — no build/tag/push of an artifact.
- **Config:** secrets live in Render dashboard (good); but the dashboard **bakes**
  `VITE_*` values into the static bundle at build time (`build:staging` vs `build`),
  so the staging and prod bundles are **different artifacts**.
- **Dependency locking:** dashboard uses `--frozen-lockfile`; **core build uses
  `npm install` (not `npm ci`)** → version drift possible between staging and live.

### Conclusion
The described immutable-artifact-promotion pattern is **NOT** in place. Cardbey
promotes **source** and rebuilds per environment.

## (1) What could break (if we replatform to image-based deploys)

- **Production deploys** could fail or behave differently if Render services switch
  from `runtime: node` (native build) to `runtime: image` (pull from registry).
- **Dashboard runtime config**: the SPA currently bakes `VITE_*` at build time. A
  single image cannot carry two different baked configs. Making one image serve all
  envs requires moving to **runtime config injection** (e.g. `/config.js` or
  `window.__ENV` fetched at boot) — a behavior change for the frontend.
- **Prisma migrations**: today they run inside the Render build/preDeploy. In an
  image model, migrations must run as an explicit deploy step (preDeploy/release),
  or they won't execute.
- **Keepalive cron** and `healthCheckPath` wiring must be preserved.
- **Rollback semantics** change (Render deploy history → registry tag redeploy).

## (2) Why

- Render chooses build behavior from service `runtime` and lockfiles. Changing the
  deploy source (git build → prebuilt image) changes the entire release mechanism.
- Vite inlines `import.meta.env.VITE_*` at build time; a truly env-agnostic image
  must read config at runtime instead.

## (3) Impact scope

- `render.yaml` (root) — all 4 web services + keepalive.
- `apps/core/cardbey-core` — Dockerfile, start/migrate sequencing.
- `apps/dashboard/cardbey-marketing-dashboard` — Dockerfile or static-serve image,
  runtime config strategy.
- `.github/workflows/*` — new build+push+promote workflows.
- Render dashboard settings (manual, out-of-repo) — registry credentials, env vars.

## (4) Smallest safe patch (phased; each phase independently revertable)

**Phase 0 — Non-breaking hardening (safe to do now, no deploy-method change):**
- Core build: `npm install` → `npm ci` in `render.yaml` (lock versions; staging+live).
  Risk: fails if `package-lock.json` is out of sync — validate first.
- Add a **promotion guard** workflow: require `staging` green before `main` merge.
- Document the current branch-promotion flow explicitly.

**Phase 1 — Build artifacts in CI (additive, does not touch live):**
- Add Dockerfiles for core + dashboard.
- Add `.github/workflows/build-artifact.yml`: on push to `dev`/`staging`/`main`,
  build image tagged with commit SHA, push to **GHCR**. Render is untouched, so
  nothing in production changes — this just *produces* artifacts in parallel.

**Phase 2 — Promote workflow (additive):**
- Add `.github/workflows/promote.yml` (manual `workflow_dispatch`): retag an existing
  SHA image as `staging` / `live` in GHCR. Still does not change Render.

**Phase 3 — Cutover (HIGH RISK — explicit confirmation required, one service at a time):**
- Switch **staging** Render services to `runtime: image` pulling the GHCR tag.
- Implement dashboard **runtime config injection** so one image serves all envs.
- Move Prisma migrate to an explicit preDeploy/release step.
- Soak on staging, then cut over **production** last.

## Recommendation

Adopt Phases 0–2 first (no production risk), keep Render's git build as the live
path, and treat Phase 3 as a separate, confirmed migration. This delivers the
immutable-artifact pipeline without endangering live until you explicitly approve
the cutover.
