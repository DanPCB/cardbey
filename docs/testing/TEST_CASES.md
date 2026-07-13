# Performer E2E Test Cases

All cases below are implemented under `apps/dashboard/cardbey-marketing-dashboard/tests/e2e/`.

## Priority 1 — Critical

| # | Case | File | Assertion |
|---|------|------|-----------|
| 1 | create campaign → store picker → select store → campaign flow | `journeys/campaign-creation.journey.ts` | Picker visible; store click; mission continues (composer / end-mission) |
| 2 | create store → form → submit → store created | `journeys/store-creation.journey.ts` | Store creation draft card; fill fields; `store_mission_started` message |
| 3 | help → help response (no store picker) | `journeys/help-chat.journey.ts` | Help copy visible; picker count = 0 |

## Priority 2 — High

| # | Case | File | Assertion |
|---|------|------|-----------|
| 4 | Multi-store user → 5 stores in picker | `journeys/multi-store.journey.ts` | 5 store cards with names/logos |
| 5 | Single-store user → auto-select | `journeys/multi-store.journey.ts` | No picker; campaign mission continues |
| 6 | No-store user → guide to store creation | `journeys/multi-store.journey.ts` | `create_store` draft form; deferred campaign copy |

## Priority 3 — Medium

| # | Case | File | Assertion |
|---|------|------|-----------|
| 7 | what can you do → capabilities | `journeys/help-chat.journey.ts` | Capabilities / bridge items visible |
| 8 | called CA HANDYMAN → clarification | `regressions/store-picker-regression.test.ts` | Clarify chips; no store picker |
| 9 | asdfjkl → clarification | `regressions/store-picker-regression.test.ts` | Ambiguous clarify; no store picker |

## Priority 4 — Regression prevention

| # | Case | File | Assertion |
|---|------|------|-----------|
| 10 | create campaign → picker (not greeting) | `regressions/campaign-regression.test.ts` | Picker visible; no “How can I help you today?” |
| 11 | Store picker renders correctly | `regressions/store-picker-regression.test.ts` | 5 cards, logos, `data-testid` per store |
| 12 | help → no store picker forced | `regressions/campaign-regression.test.ts` | Help response; picker absent |

## Contract tests

| Case | File | Notes |
|------|------|-------|
| Intake clarify / create_store / chat shapes | `contracts/intake.contract.test.ts` | Live tests skipped unless `E2E_LIVE=1` |
| Fixture type compatibility | `contracts/types.contract.test.ts` | Always runs offline |

### API action mapping (actual backend)

| User intent | Expected `action` | Notes |
|-------------|-------------------|-------|
| create campaign (multi-store) | `clarify` | `clarifyType: execution_context_store_picker` |
| store selected | `campaign_mission_started` or `campaign_creation` | Single-store may skip picker |
| create store | `create_store` | Includes `storeCreationDraft` when fields missing |
| help | `chat` | No `execution_context_store_picker` |

> The spec mentioned `campaign_flow`; the production intake contract uses `campaign_creation` / `campaign_mission_started`.
