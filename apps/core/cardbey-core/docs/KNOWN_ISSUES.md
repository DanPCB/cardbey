# Known Issues — Cardbey Core (V1)

## Test Suite

**Status (2026-06-17):** `npx vitest run` — **2420 passed**, 0 failed (10 todo, 10 skipped).

### Fixes applied for V1 test gate

| Category | Count | Resolution |
|----------|------:|------------|
| Prisma `@prisma/client` vs `client-gen` | 14 suites | Vitest alias → `node_modules/.prisma/client-gen` |
| Kernel `direct_action` → `proactive_plan` | ~15 | Test expectations + hero/confirm path alignment |
| Broker guard default ON (`BROKER_BLOCK_DIRECT_ACTION`) | 4 | Test harness baseline `false` in `setupEnv.js`; explicit `true` in kernel flow tests |
| Skill executor honest `blocked` status | 12 | Tests expect `blocked` with reason codes |
| Hybrid router `confirmed: true` on DELETE | 3 | Product delete integration tests |
| Intake confirm `executionPath` from registry | 2 | Production fix in `performerIntakeV2Routes` confirm handler |
| `storeCreateFormPayload` scope bug | 5+ intake 500s | Hoisted variable before shortcut block |
| SSE stream policy env isolation | 2 | `vi.stubEnv('NODE_ENV', 'production')` in stream policy tests |
| Schema freeze ghost DB | 1 | Remove `prisma/prisma/dev.db` if present locally |

### Non-critical / environmental

#### EPERM on Windows during `pretest` / `prisma generate`

- **Symptom:** `EPERM: operation not permitted, rename ... query-engine-windows.exe`
- **Cause:** Another process (IDE, running API, antivirus) locks the Prisma query engine binary.
- **Workaround:** Stop local Core/dev processes, close handles on `node_modules/.prisma/client-gen`, retry `npm test`.

#### SQLite JSON defaults

- **Status:** Fixed — see `docs/SQLITE_SCHEMA_DRIFT.md`. JSON fields use app-level defaults; migration uses `TEXT` not `JSONB`.

#### Dashboard Control Center test

- Separate package (`cardbey-marketing-dashboard`); not part of Core `npm test`.

### Intentional skips

- `tests/qa-sweep.test.js`, `tests/draft-qa-agent.test.js` — skipped by design
- `src/test/e2e/**` — opt-in via `RUN_E2E=true`
