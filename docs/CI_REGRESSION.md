# CI and local regression enforcement

Foundation checks that fail fast on broken mounts, missing i18n, leaked secrets, and stale runway paths — without requiring live external API keys.

## Risk posture

| Check | What it catches | What it does *not* weaken |
|-------|-----------------|---------------------------|
| `scan-secrets.mjs` | Leaked keys in `.txt`/logs | Does not skip tests |
| Route contract tests | Removed `server.js` mounts | Static source read — no network |
| `healthRoute.contract` | Broken `/api/health` shape | Mocks DB/SSE — no live DB |
| Dashboard `vitest run` | Regressions in UI/helpers | Integration draft test stays `it.skip` without `RUN_INTEGRATION` |
| Live smoke | Down Core/Dashboard | Optional; CI uses `--offline` + contracts |

## Command order (clean machine)

Run from **repo root** (`C:\Projects\cardbey`):

### 1. Environment cleanup (Windows)

```powershell
pnpm dev:cleanup -- --force
```

### 2. Prisma client (Core)

```powershell
pnpm dev:prisma
```

If you see `EPERM` on `client-gen`, stop all `node`/`nodemon` processes and retry step 1.

### 3. Preflight (secrets)

```powershell
pnpm regression:preflight
```

**Action required:** delete `apps/core/cardbey-core/src/test/Supercopipot command..txt` if present (contains a real API key) and rotate the key.

### 4. Core contract tests (no live server)

```powershell
pnpm regression:contracts
```

Covers:

- `GET /api/health`, `/api/ping` (mocked)
- `GET /api/journeys/templates` (mocked Prisma)
- `server.js` mount contract (journeys, health, SSE, draft-store)
- SSE legacy `key=admin` blocked in production

### 5. Core full test suite

```powershell
pnpm regression:core
```

Runs `pretest` (Prisma generate + test DB push) then all Core vitest tests.

### 6. Dashboard tests

```powershell
pnpm regression:dashboard
```

Includes `renderWithI18n`, blackboard/performer stream, `ApprovalCard` i18n, and `i18nContract.test.ts`.

### 7. Live smoke (servers must be running)

**Terminal A:** `pnpm dev:core`  
**Terminal B:** `pnpm dev:dashboard`

```powershell
pnpm regression:smoke
```

Or Core-only smoke:

```powershell
pnpm --filter @cardbey/core run smoke:dev
```

### One-shot local regression (no live servers)

```powershell
pnpm regression
```

Runs: preflight → contracts → core tests → dashboard tests.

Offline smoke only (constants check):

```powershell
pnpm regression:smoke:offline
```

## CI (GitHub Actions)

Workflow: `.github/workflows/foundation-regression.yml`

| Job | Steps |
|-----|--------|
| preflight | `pnpm regression:preflight` |
| core-contracts | Prisma generate + `pnpm regression:contracts` |
| core-tests | Prisma + `pnpm --filter @cardbey/core test` |
| dashboard-tests | `pnpm --filter @cardbey/dashboard exec vitest run` |

Live HTTP smoke is **not** required in CI (avoids flaky ports). Use `pnpm regression:smoke` locally after `dev:core` + `dev:dashboard`.

## Dashboard test helpers

- `src/test/renderWithI18n.tsx` — wraps `I18nextProvider`, optional `locale`
- `src/app/console/performer/consoleBlackboardVisibility.ts` — unified stream; separate `BlackboardFeed` panel always hidden on console
- `ApprovalCard` — `useTranslation()` + keys under `performer.*` in `i18n.js` (en + vi)

## Related docs

- [LOCAL_DEV.md](./LOCAL_DEV.md) — ports, cleanup, doctor
- [RUNWAY_OWNERSHIP.md](./RUNWAY_OWNERSHIP.md) — canonical API paths
