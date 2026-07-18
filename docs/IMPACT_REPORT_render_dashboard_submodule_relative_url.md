# Impact Report Addendum — Relative submodule URL (2026-07-17)

## What happened after Architecture B

Pointing `cardbey-dashboard` at `DanPCB/cardbey-marketing-dashboard` as the **primary** repo still failed with:

```text
It looks like we don't have access to your repo, but we'll try to clone it anyway.
Cloning from https://github.com/DanPCB/cardbey-marketing-dashboard
```

So the failure is **not only** “submodule lacks GitHub App token.” This Render **service’s linked Git credentials** also cannot clone the private dashboard repo as a primary checkout (even though the App installation UI shows All repositories). Architecture B is blocked until those service Git credentials are repaired in the Render UI.

## Critical Render behavior (missed in first pass)

Per [Render GitHub docs](https://render.com/docs/github): if `.gitmodules` exists at the repo root, Render **automatically clones submodules during build**, before/alongside your `buildCommand`.

That matches the log shape (Render wrapper + retries), not a bare `git submodule` from our script.

| Step | What runs | Auth |
|------|-----------|------|
| 1 | Clone primary `DanPCB/cardbey` | GitHub App / service credentials ✅ |
| 2 | Auto-clone submodule URLs from `.gitmodules` | Must reuse parent auth or have explicit access ❌ with absolute HTTPS |
| 3 | `buildCommand` | Never reached when step 2 fails |

## Smallest safe remediation now

**Keep Architecture A** (primary repo = `DanPCB/cardbey`, which already clones).

Change `.gitmodules` submodule URL from absolute:

```ini
url = https://github.com/DanPCB/cardbey-marketing-dashboard.git
```

to **relative**:

```ini
url = ../cardbey-marketing-dashboard.git
```

Git resolves this against the parent remote (`https://github.com/DanPCB/cardbey.git` → `https://github.com/DanPCB/cardbey-marketing-dashboard.git`) and CI systems (including Render’s recursive checkout) typically reuse the **same credentials** as the parent clone.

Revert static-site `render.yaml` services to:

- `repo: https://github.com/DanPCB/cardbey`
- monorepo `rootDir: .`
- `staticPublishPath: apps/dashboard/cardbey-marketing-dashboard/dist`
- build via `pnpm --filter @cardbey/dashboard` after `git submodule sync` + `update` (relative URL)

No PAT committed. No app-code changes.

## If relative URL still fails

1. Render → service **Settings → Git Credentials** → reconnect an account that can open the dashboard repo in the Create Service repo list.  
2. Or set secret `GITHUB_SUBMODULE_TOKEN` and use `scripts/init-private-dashboard-submodule.mjs` — note: Render auto-clone may still run first; relative URL is the primary fix for that path.

## What could break

| Risk | Mitigation |
|------|------------|
| Local clones with unusual remotes resolve relative URL oddly | Standard `origin` = `github.com/DanPCB/cardbey` |
| Someone hardcodes absolute URL again | deploy-readiness asserts relative `.gitmodules` URL |
| Architecture B service still pointed at dashboard in Render UI | Switch Repository back to `DanPCB/cardbey`, Clear cache & deploy |

## Acceptance

Clear build cache & deploy on `cardbey-dashboard` with primary repo `cardbey` must pass submodule auto-clone without username prompts, then complete Vite publish to `apps/dashboard/cardbey-marketing-dashboard/dist`.
