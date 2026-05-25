# Cardbey local development

Deterministic local setup: **one Core API**, **one Dashboard**, **one SQLite database target**.

## Canonical ports

| Service | Port | URL |
|---------|------|-----|
| Core API | **3001** | http://127.0.0.1:3001/api/health |
| Dashboard (Vite) | **5174** | http://127.0.0.1:5174/ |

> The dashboard intentionally uses **5174** (not 5173). CORS and SSE docs assume this port.

## Prerequisites

- Node.js **20.x** (see root `package.json` engines)
- pnpm **10.x** (`packageManager` in root `package.json`)
- `apps/core/cardbey-core/.env` with `DATABASE_URL` pointing at your local SQLite file

Default SQLite dev DB (from `.env`):

```env
DATABASE_URL="file:./prisma/dev.db"
```

Prisma schema for local dev:

```
apps/core/cardbey-core/prisma/sqlite/schema.prisma
```

## Where to run commands

Scripts work from **any** of these directories:

| Location | Core | Dashboard | Cleanup / Prisma / Doctor |
|----------|------|-----------|-------------------------|
| Repo root `C:\Projects\cardbey` | `pnpm dev:core` | `pnpm dev:dashboard` | `pnpm dev:cleanup` etc. |
| `apps/core/cardbey-core` | `pnpm dev` or `pnpm dev:core` | `pnpm dev:dashboard` | `pnpm dev:cleanup` etc. |
| `apps/dashboard/cardbey-marketing-dashboard` | `pnpm dev:core` | `pnpm dev` or `pnpm dev:dashboard` | `pnpm dev:cleanup` etc. |

> **Note:** `pnpm dev:cleanup -- --force` passes `--force` to the script (the `--` is required).

## Quick start (two terminals)

From the **repo root** (or `apps/core/cardbey-core` for Core only):

```bash
pnpm install
pnpm dev:doctor --probe
```

**Terminal 1 — Core API:**

```bash
pnpm dev:core
```

**Terminal 2 — Dashboard:**

```bash
pnpm dev:dashboard
```

Verify:

- `GET http://127.0.0.1:3001/api/health` → `200` with `"ok":true`
- Browser → http://127.0.0.1:5174/

## When things get stuck (Windows)

### 1. Diagnose

```bash
pnpm dev:doctor --probe
```

Checks (no secrets printed):

- Who owns ports 3001 and 5174
- Duplicate `nodemon` / `dev-api-entry` / Vite processes
- `DATABASE_URL` target (masked)
- Prisma `client-gen` lock risk
- Required env var **presence** only

### 2. Clean up stale processes

```powershell
pnpm dev:cleanup
```

Or non-interactive:

```powershell
pnpm dev:cleanup -- --force
```

Preview only:

```powershell
pnpm dev:cleanup -- --what-if
```

This stops **Cardbey-related** `node.exe` processes only (paths/commands matching `cardbey-core`, `cardbey-marketing-dashboard`, `dev-api-entry`, `nodemon`, `vite`, `test-auth-local.mjs`). It does **not** kill all Node processes globally.

### 3. Regenerate Prisma client (SQLite)

After cleanup, from repo root:

```bash
pnpm dev:prisma
```

On Windows this runs `db:generate:sqlite:retry` (removes locked query engine before generate).

### 4. Start again

```bash
pnpm dev:doctor --probe
pnpm dev:core      # terminal 1
pnpm dev:dashboard # terminal 2
```

## Startup guards

`pnpm dev:core` and `pnpm dev:dashboard` run **predev** checks via `scripts/ensure-dev-runway.mjs`:

- **Fail** if the service port is already in use
- **Fail** if another Cardbey Core dev-api / Dashboard Vite process is already running

This prevents “nodemon crashed but port 3001 still serving” confusion.

## Package scripts reference

| Script | Location | Purpose |
|--------|----------|---------|
| `pnpm dev` | root | Print canonical startup instructions |
| `pnpm dev:core` | root | Start Core API (`@cardbey/core` → `dev`) |
| `pnpm dev:dashboard` | root | Start Dashboard Vite |
| `pnpm dev:doctor` | root | Environment diagnostics |
| `pnpm dev:cleanup` | root | Stop stale Cardbey dev processes |
| `pnpm dev:prisma` | root | SQLite `prisma generate` (safe retry on Windows) |
| `pnpm dev:core` → `predev` | core | Runway guard before nodemon |
| `pnpm dev` | core | `with-role.mjs dev-api` (nodemon + bootstrap) |
| `pnpm dev:api` | core | Same guard + dev-api (alias) |
| `pnpm dev` | dashboard | Vite port **5174** |
| `pnpm smoke:dev` | core | Smoke test against `localhost:3001` |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `EPERM` on `query-engine-windows.exe` | Multiple node processes locking Prisma | `pnpm dev:cleanup` → `pnpm dev:prisma` |
| Port 3001 in use | Orphan Core API | `pnpm dev:doctor`, then `pnpm dev:cleanup` |
| Nodemon crashed but API still responds | Second node PID still listening | `pnpm dev:cleanup`, single `pnpm dev:core` |
| Dashboard won’t start | Port 5174 taken or second Vite | `pnpm dev:cleanup`, one `pnpm dev:dashboard` |
| `pretest` fails with EPERM | Same as Prisma lock | Cleanup + `pnpm dev:prisma` before tests |

## What not to run for normal UI dev

- Multiple `pnpm dev:core` / `npm run dev` in `cardbey-core` in parallel
- Long-running `node scripts/test-auth-local.mjs` unless you are debugging auth
- `dev:all` (API + worker) unless you need the worker role

Store creation, Performer, SSE, and device pairing use the same Core API process and `DATABASE_URL`; keeping a single API instance avoids stale DB handles and Prisma locks.

## Runway ownership

Canonical API/UI owners (missions, blackboard, artifacts, devices, journeys): **[RUNWAY_OWNERSHIP.md](./RUNWAY_OWNERSHIP.md)**.  
Store-build entry paths: `apps/core/cardbey-core/docs/RUNWAY_INVENTORY.md`.

After pulling changes, verify journeys mount: `GET http://127.0.0.1:3001/api/journeys/templates` → `200` with `{ templates: [...] }`.

## Regression / CI

See **[CI_REGRESSION.md](./CI_REGRESSION.md)** for cleanup → prisma → preflight → core → dashboard → live smoke.

```bash
pnpm regression
```
