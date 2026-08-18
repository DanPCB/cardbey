# Deployment & Promotion (dev → staging → live)

This documents how cardbey ships code, and the immutable-artifact pipeline added
alongside it (Phases 0–2). Background and risk analysis:
[`IMPACT_REPORT_artifact_promotion_cicd.md`](./IMPACT_REPORT_artifact_promotion_cicd.md).

## 1. Branch promotion flow (current live path)

```
feature/*  ──PR──▶  dev  ──PR──▶  staging  ──PR──▶  main (live)
                     │              │                 │
                  CI tests      Render builds      Render builds
                                staging services   prod services
```

- Promotion is by **git merge**, never by editing a downstream branch directly.
- `main` is protected by **Promotion Guard** (`.github/workflows/promotion-guard.yml`):
  a PR into `main` must come from `staging` (or a `release/` / `rollback/` / `hotfix/`
  branch, or carry the `promotion-override` label for an approved hotfix).
- Render auto-deploys each branch from source:
  - `staging` → `cardbey-core-staging`, `cardbey-dashboard-staging`
  - `main` → `cardbey-core`, `cardbey-dashboard`
- Core build uses **`npm ci`** (locked to `package-lock.json`) so staging and live
  resolve identical dependency versions.
- **R2 media CDN CORS** (hero video playback): see [`R2_MEDIA_CDN_CORS.md`](./R2_MEDIA_CDN_CORS.md).
  Upload can succeed while browser playback fails until bucket CORS allows dashboard/public origins.

### CI gates (GitHub Actions)
`tests.yml`, `contract-tests.yml`, `foundation-regression.yml`, `truth-enforcement.yml`,
`golden-flows.yml` — run on PRs/pushes and must pass before promotion.

## 2. Immutable artifact pipeline (added, runs in parallel)

> Status: **Phases 0–2 implemented.** These produce and promote images but do **not**
> yet drive Render. Production still deploys via the branch flow above until the
> Phase 3 cutover is explicitly approved.

### Build once — `build-artifact.yml`
On push to `dev`/`staging`/`main`, builds two images and pushes to GHCR, tagged by
the **commit SHA** (immutable) and the branch name (moving pointer):

- `ghcr.io/<owner>/cardbey-core:sha-<short>`
- `ghcr.io/<owner>/cardbey-dashboard:sha-<short>`

Dockerfiles:
- `apps/core/cardbey-core/Dockerfile` (context = **repo root**; needs `packages/template-engine`)
- `apps/dashboard/cardbey-marketing-dashboard/Dockerfile` (context = **repo root**;
  needs submodules checked out)

### Promote the same artifact — `promote.yml` (manual)
`Actions → Promote Artifact → Run workflow`, supply the SHA and a target channel:

```
sha:        a1b2c3d          # already built by Build Artifact
target:     staging | live
component:  both | core | dashboard
```

It retags the existing SHA image in-registry (`docker buildx imagetools create`) —
**no rebuild**, identical bytes — to `:staging` or `:live`.

### Rollback
Re-run `Promote Artifact` with a **previous** SHA and the same target channel. Keep
the last several SHA tags in GHCR.

## 3. Not yet done — Phase 3 cutover (requires confirmation)

To make Render actually deploy the promoted images (true build-once-deploy-many):

1. Switch Render services to `runtime: image` pulling `ghcr.io/.../:staging` / `:live`.
2. Add **runtime config injection** for the dashboard (Vite bakes `VITE_*` at build
   time, so one image can't serve two envs without this).
3. Move Prisma `migrate deploy` to an explicit preDeploy/release step.
4. Soak on staging, then cut over production last.

Do not start Phase 3 without an explicit go-ahead — it changes how live is built and
served.
