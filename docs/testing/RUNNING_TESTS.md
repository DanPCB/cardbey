# Running Performer E2E Tests

All commands run from the dashboard package:

```bash
cd apps/dashboard/cardbey-marketing-dashboard
pnpm install
pnpm exec playwright install chromium
```

## Quick start

```bash
# All E2E tests (starts Vite dev server on :5174 automatically)
pnpm run test:e2e

# Interactive UI mode
pnpm run test:e2e:ui

# Headed browser
pnpm run test:e2e:headed

# Debug one test
pnpm run test:e2e:debug -- tests/e2e/regressions/store-picker-regression.test.ts
```

## Targeted suites

```bash
pnpm run test:e2e:journeys      # User journeys only
pnpm run test:e2e:regression    # Regression prevention
pnpm run test:e2e:contract      # Contract / fixture tests
```

Legacy aliases `pnpm run e2e` and `pnpm run e2e:ui` still work.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DASHBOARD_BASE_URL` | `http://127.0.0.1:5174` | Dashboard origin |
| `E2E_BASE_URL` | same as above | Alias for base URL |
| `DASHBOARD_TOKEN` | — | Bearer token injected into localStorage (recommended) |
| `E2E_LIVE` | — | Set to `1` to run live intake contract tests against core |
| `E2E_CORE_URL` | `http://127.0.0.1:3001` | Core API for live contract tests |
| `CI` | — | Set by GitHub Actions (enables retries, fresh webServer) |

### Auth setup

```bash
# PowerShell
$env:DASHBOARD_TOKEN = "<your-dev-bearer-token>"
pnpm run test:e2e
```

Without `DASHBOARD_TOKEN`, journeys still run but may hit guest/unauthenticated UI paths.

## Live contract tests (optional)

Requires core running locally:

```bash
# Terminal 1 — core
pnpm -w run dev:core

# Terminal 2 — dashboard E2E with live API contracts
cd apps/dashboard/cardbey-marketing-dashboard
$env:E2E_LIVE = "1"
$env:DASHBOARD_TOKEN = "<token>"
pnpm run test:e2e:contract
```

## Reports

After a run, open the HTML report:

```bash
pnpm exec playwright show-report
```

In CI, download the `playwright-report` artifact from the **E2E Tests (Performer)** workflow.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port 5174 in use | Stop other Vite instances or set `DASHBOARD_BASE_URL` |
| Composer not found | Ensure `/app?entry=performer` loads; set `DASHBOARD_TOKEN` |
| Store picker timeout | Check intake mock or core returns `clarifyType: execution_context_store_picker` |
| Live contract skipped | Expected unless `E2E_LIVE=1` and `DASHBOARD_TOKEN` are set |
