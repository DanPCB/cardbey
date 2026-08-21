# Phase 2 — Performer Content Editing Bridge

**Authorization:** `ACK PHASE_2_PERFORMER_CONTENT_EDITING_BRIDGE`  
**Date:** 2026-08-21  
**Verdict:** `PHASE_2_PERFORMER_CONTENT_EDITING_BRIDGE_READY`

## Feature flags (default OFF)

| Layer | Flag | Default |
|-------|------|---------|
| Core | `ENABLE_PERFORMER_CONTENT_EDITING_BRIDGE_V1` | `false` |
| Dashboard | `VITE_ENABLE_PERFORMER_CONTENT_EDITING_BRIDGE_V1` | `false` |
| API surface | `GET /api/v2/flags` → `ENABLE_PERFORMER_CONTENT_EDITING_BRIDGE_V1` | mirrors Core |

**Enable (local/staging):** set both env vars to `true`, restart Core + Dashboard.  
**Kill-switch:** unset or `false` on either side — server rejects bridge routes; client hides fork UI (no inactive placeholders).

## Bridge / API contract

Base: `/api/performer/content-editing-bridge` (auth + flag required except status)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/status` | `{ enabled }` |
| POST | `/resolve` | Canonical context + `editManuallyUrl` |
| POST | `/warnings` | Shows with deterministic relevance warnings |
| POST | `/propose` | Proposal only (no mutation) |
| POST | `/accept` | Apply proposal with `expectedUpdatedAt` concurrency |
| POST | `/discard` | Drop proposal |
| POST | `/hide` | Phase 1 hide lifecycle (`confirmed: true`) |

## Context resolution

Reuses Phase 0 `resolveWebsiteEditingContext` — no second resolver, no new Business/DraftStore inventiveness beyond Phase 0 init contract.

## Edit manually

Deep-link: Draft Review `websiteEditing=1&section=shows&itemId=…&returnTo=/app?contentBridgeReturn=1…`  
Opens existing Shows adapter + `ShowEditDrawer`. No drawer in Performer.

## Return / resume

On return query `contentBridgeReturn=1`, Performer injects a factual summary message and refreshes via `/resolve`. Does **not** start a new create-store run. Limitation: full mission blackboard resume is best-effort (same Performer surface + store/revision); no parallel run-resumption system invented.

## Improve automatically

- **Proposal provider:** `deterministic_relevance` (title) when scope/`relevanceWarning` applies; `deterministic_a11y` for image alt when LLM keys exist; otherwise **`not_configured`** (truthful — no fake AI).
- Proposal held in-process memory (not a Shows DB).
- Accept writes via existing `upsertStoreShow` — **never publishes**.
- Field scope preserved; lifecycle status not changed by improve.

## Hide now

Confirmation required → existing `setStoreShowStatus(HIDDEN)` + feed bump. Does not archive/delete. Restore remains in Website Editing.

## Concurrency

`baseUpdatedAt` / `expectedUpdatedAt` on accept → `409 concurrency_conflict` if Show changed after proposal.

## Security

Flag, auth, store ownership (via Phase 0 + Shows services), item-to-store association, sanitized `returnTo`, no cross-store leakage.

## Unchanged

- Performer create-store orchestration / blackboard
- Catalog Draft Review + publish path
- Phase 0 resolver idempotency

## Tests

| Suite | Result |
|-------|--------|
| Core bridge (6) + flag-off (1) | pass |
| Dashboard bridge flags/deeplink/i18n (5) | pass |

## Manual verification

Enable both flags → Performer chip/goal “Review store content” → fork card → Edit manually / Improve / Hide. Flag off → no UI / 403.

## Remaining limitations

- Free-form LLM rewrite scopes return `NotConfigured` (by design — no fabricated AI).
- Proposal store is in-memory (process-local).
- Admin acting-on-behalf only when `adminSupport` + platform admin (existing rules).
- No bulk remediation / product adapters.

## Files changed (Phase 2)

**Core:** `features.js`, `home.js` flags, `performerContentEditingBridge.js`, routes, `server.js` mount, tests, `.env.example` note  

**Dashboard:** bridge flags/api/offer helpers, `ContentEditForkCard`, FormCard + ConsoleCentreColumn + usePerformerConsole wiring, i18n resources + merge, tests, `.env.example` note  

**Docs:** this report
