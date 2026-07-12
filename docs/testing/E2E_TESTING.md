# E2E Testing — Cardbey Performer

End-to-end tests for the **Performer console** live in the dashboard app and exercise the full UI journey: composer input → `POST /api/performer/intake/v2` → agent message / form cards → user selection → follow-up intake.

## Location

```
apps/dashboard/cardbey-marketing-dashboard/tests/e2e/
├── fixtures/          # Auth helpers, mock intake payloads, route installers
├── pageObjects/       # PerformerPage, StorePickerPage, CampaignPage
├── journeys/          # Full user journeys (campaign, store, help, multi-store)
├── contracts/         # Intake response shape + optional live API contracts
└── regressions/       # Known bug prevention (store picker vs greeting, etc.)
```

Playwright config: `apps/dashboard/cardbey-marketing-dashboard/playwright.config.ts`

## Strategy

| Layer | Purpose | Runs in CI |
|-------|---------|------------|
| **Journeys** | Simulate typing, sending, clicking store cards | Yes (mocked intake) |
| **Regressions** | Prevent store-picker / greeting mismatches | Yes (mocked intake) |
| **Contract fixtures** | Validate mock payloads match frontend expectations | Yes (offline) |
| **Live contracts** | Hit real core intake API | Optional (`E2E_LIVE=1`) |

Mocked tests intercept `**/api/performer/intake/v2` in the browser so CI does not require a running `cardbey-core` instance. This still validates the **frontend-backend contract** — the UI must render `execution_context_store_picker` responses correctly.

## Critical selectors

| Surface | Selector |
|---------|----------|
| Store picker root | `[data-testid="execution-context-store-picker"]` |
| Store card | `[data-testid="execution-context-store-{id}"]` |
| Composer (idle) | `textarea` / MissionInput |
| Composer (in mission) | `textarea[aria-label="Message input"]` |
| Send | `button[aria-label="Send"]` |

## CI

Workflow: [`.github/workflows/e2e-tests.yml`](../../../.github/workflows/e2e-tests.yml)

Runs on PRs touching dashboard performer surfaces or core intake/intent code. HTML report uploaded as a GitHub Actions artifact (`playwright-report/`).

## Related docs

- [TEST_CASES.md](./TEST_CASES.md) — full case catalog
- [RUNNING_TESTS.md](./RUNNING_TESTS.md) — local commands and env vars
