# Impact Report — Render dashboard private submodule auth failure

**Date:** 2026-07-17  
**Service:** `cardbey-dashboard` (static) / `cardbey-dashboard-staging`  
**Symptom:** Build fails before Vite with:

```text
fatal: could not read Username for 'https://github.com': terminal prompts disabled
Cloning from https://github.com/DanPCB/cardbey-marketing-dashboard
```

## Audit findings (Phase 1)

### Exact command initiating the clone

| Source | Initiates private clone? | Notes |
|--------|--------------------------|-------|
| **Root `render.yaml` → `cardbey-dashboard` / `cardbey-dashboard-staging` `buildCommand`** | **YES** | Unconditional `git submodule update --init --recursive` |
| `apps/core/.../scripts/render-build.mjs` | No (default) | Skips unless `CARDBEY_INIT_DASHBOARD_SUBMODULE=true` |
| Dashboard `package.json` scripts / `postinstall` | No | `postinstall` only echoes Prisma skip |
| Dashboard `scripts/render-build.mjs` | No | Standalone `pnpm install` + Vite |
| Root `package.json` `prepare` | No | husky only |
| Dockerfiles / Makefiles / CI submodule | No relevant trigger for this static service | |

**Clone runs inside the static-site `buildCommand`, after Render checks out the parent repo and before `pnpm install` / Vite.** It does **not** go through core `render-build.mjs`.

### Architecture in use today (Architecture A)

```text
Render static service (cardbey-dashboard)
  → clones DanPCB/cardbey   (GitHub App credentials applied here)
  → git submodule update --init --recursive
       → clones DanPCB/cardbey-marketing-dashboard over plain HTTPS
       → GitHub App token is NOT injected into this nested git clone
  → pnpm --filter @cardbey/dashboard run build
```

### Why “All repositories” on the Render GitHub App is not enough

Render applies the GitHub App installation credential to the **primary** repository checkout only.  
`git submodule update` starts a **separate** HTTPS clone of `.gitmodules` URL. That child process has no username/password/token → Git refuses interactive prompt → the observed error. This is independent of App repository scope.

### `.gitmodules` (Phase 2)

```ini
[submodule "apps/dashboard/cardbey-marketing-dashboard"]
    path = apps/dashboard/cardbey-marketing-dashboard
    url = https://github.com/DanPCB/cardbey-marketing-dashboard.git
    branch = main
```

- Has `.git` suffix; no embedded user/token; HTTPS (not SSH); no duplicates.
- Canonical and safe to keep for local/monorepo use.

### Why cache previously masked the failure

1. Render restored a prior build cache whose submodule working tree already matched the pinned SHA.  
2. `git submodule update` then needed **no remote fetch**.  
3. Cache miss / eviction / new submodule SHA → fresh private clone → unauthenticated HTTPS fails.

Cache is not a fix; clean clone must succeed.

### Preferred remediation (Phase 3)

**Option 1 — Architecture B (selected):** connect static services directly to `DanPCB/cardbey-marketing-dashboard`.

Evidence the dashboard is independently deployable:

- Own `pnpm-lock.yaml` (no `workspace:` deps).
- Own `scripts/render-build.mjs` (`pnpm install --frozen-lockfile` + `build:dashboard` / `build:staging`).
- Own `apps/dashboard/.../render.yaml` already documents Architecture B (`staticPublishPath: dist`).

### Effects of switching architecture

| Concern | After Option 1 |
|---------|----------------|
| Deploy triggers | Pushes to **dashboard** `main`/`staging` (not parent submodule bumps alone) |
| Branch | `main` / `staging` on dashboard repo |
| Env vars | Kept in root `render.yaml` (VITE_*) |
| Root directory | `.` (dashboard repo root) |
| Publish dir | `dist` |
| Domain | Unchanged (still bound to Render service name) |
| Traceability | Dashboard commit SHA is the deploy artifact |

Parent submodule remains for monorepo/local/core language tooling; core continues to skip private submodule init by default.

### Smallest safe patch

1. Update root `render.yaml` dashboard services: `repo` → dashboard repo; drop submodule init; use `node scripts/render-build.mjs`; `staticPublishPath: dist`.  
2. Add deploy-readiness guard so dashboard services never reintroduce unauthenticated `git submodule update`.  
3. Document Render: **Clear build cache & deploy**; confirm service repo connection if Blueprint sync does not auto-switch an existing service.

### What could break

| Risk | Mitigation |
|------|------------|
| Existing Render service still pointed at parent repo | Manual reconcile in Render UI (repo = dashboard) + Clear cache & deploy |
| Parent-only submodule bump no longer redeploys live UI | Push/merge to dashboard `main` (already the source of truth) |
| Missing monorepo packages at build | Verified: no `workspace:` deps; standalone lockfile |

### Non-goals (unchanged)

Application code, Visit store behavior, making the repo public, embedding PATs, core submodule skip policy.
