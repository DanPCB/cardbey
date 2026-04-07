# Impact Report: Render deploy path + package manager detection

Date: 2026-04-07  
Scope: Deploy configuration only (no runtime logic changes)

## Why this report exists

Cardbey is a monorepo. Render auto-detects the package manager based on lockfiles, and can run an install step before the configured build command. A root-level `yarn.lock` causes Render to run Yarn from the repo root, which can install dependencies into the wrong directory for services whose true root is a subfolder (e.g. the dashboard). This has already manifested as missing `vite` binaries during the dashboard build.

## (1) What could break

- **Render build behavior could change for existing services**
  - Services that currently rely (intentionally or accidentally) on Yarn at repo root may stop building the same way once `yarn.lock` is removed.
- **CI / local developer workflows that use Yarn at repo root could change**
  - Developers running `yarn` from the monorepo root may see different dependency resolution after removal.
- **Blueprint-driven deploys could start applying new defaults**
  - Adding a repo-root `render.yaml` can introduce a new “source of truth” if the team enables Blueprint sync.

## (2) Why

- Render uses lockfile presence to choose a package manager; root `yarn.lock` triggers Yarn.
- Monorepo services (dashboard) need installs to occur in their `rootDir`, otherwise binaries like `node_modules/.bin/vite` won’t exist where the build command expects them.

## (3) Impact scope

- **Dashboard staging/prod** (static build) — highest impact, expected positive fix.
- **Any other Render service that builds from repo root** — potential behavior change if it previously depended on Yarn.
- **Local dev at repo root** — only if contributors use Yarn root workflows.

## (4) Smallest safe patch

- Remove **only** the repo-root `yarn.lock` (and repo-root `package-lock.json` if present) to stop Render’s Yarn auto-install.
- Add a dashboard-local `.npmrc` with `legacy-peer-deps=true` to prevent npm peer-dep resolution failures during Render installs (dashboard scope only).
- Ensure dashboard bundler packages (`vite`, `@vitejs/plugin-react`) are in dashboard `dependencies` (not `devDependencies`) so production installs don’t prune them.
- Add a repo-root `render.yaml` to explicitly set `rootDir` and build commands **only if** the team uses Blueprint sync; otherwise prefer configuring Root Directory in the Render UI.

