# Phase 3 — Interactive local browser verification

**Authorization:** `ACK PHASE_3_INTERACTIVE_LOCAL_BROWSER_VERIFICATION`  
**Date:** 2026-08-21  
**Verdict:** `PHASE_3_LOCAL_BROWSER_VERIFICATION_PARTIAL`

## Environment (runtime only; committed defaults remain false)

| Item | Value |
|------|--------|
| Core | `http://127.0.0.1:3021` (primary, bridge ON) |
| Core kill-switch | `http://127.0.0.1:3022` (bridge OFF) |
| Dashboard (bridge ON) | `http://127.0.0.1:5186` |
| Dashboard (bridge OFF) | `http://127.0.0.1:5187` |
| Database | SQLite `apps/core/cardbey-core/prisma/dev-fresh.db` |
| Persistence | `prisma_content_edit_proposal` (`READY_FOR_LOCAL`) |
| Test roles | fixture owner; second-store owner; admin register (AoB UI not fully completed) |
| Fixture stores | soft-cleaned (`cleanup.json`); marked `NON_PRODUCTION` |
| Browser | Playwright Chromium |
| Viewports | Desktop 1280×800; Mobile 390×844 |

Secrets are only in gitignored `tmp/phase3-browser-evidence/fixture-secrets.json` (not copied into this report).

## Fixture

Disposable florist + second cafe store. Shows: Spring Bouquet, Assessment, Basic Package, Hidden Bloom, Archived Bloom. Soft-cleaned after verification. **BB Flowers / live data untouched.**

## Interactive mapping (L1–L18 + browser scenarios)

| Scenario | Result | Evidence |
|----------|--------|----------|
| L1 Sign-in + Performer + store context | PASS | `01-performer-entry.png` |
| L2 Review store content / fork UI when flags ON | PASS | `02-fork-card.png` |
| L3 Advisory “may not match this business” | PASS | browser-results L3 |
| L4 Edit manually → Draft Review | PASS | `03-draft-review-shows.png` |
| L5 `section=shows` | PASS | URL/content |
| L6 Assessment highlighted / Shows surface | PASS | Assessment visible |
| L7 Harmless field save in drawer | **PARTIAL** | Drawer surface present; title input not found → mutation skipped |
| L8 Manual path does not publish | PASS | fixture `isActive: false`; no publish API |
| L9–L11 Proposal preview / discard / accept | PASS | `06-proposal-preview.png` |
| L12–L13 Conflict / stale | PASS | UI + network `409 proposal_stale` |
| L14–L15 Hide confirm (cancel + confirm) | PASS | `08-hide.png`; dialog names target |
| L16 Restore → HIDDEN | PASS | Shows restore API |
| L17 Cross-tenant deep link isolation | PASS | 403; no Assessment leak |
| L18 Dashboard kill-switch (flag OFF) | PASS | `10-flag-off.png`; fork absent |
| Core kill-switch (flag OFF) | PASS | `:3022` status `enabled:false`; propose **403** |
| Admin Account Management + reason audit | **PARTIAL** | Cross-owner Shows 403 only; full AoB reason UI not completed |
| Create-store / catalog / Preview-Publish regressions | **PARTIAL** | Not re-exercised end-to-end in this session (orchestration untouched by design) |

Playwright serial run: **1 passed** (`playwright-run2.log`).

## Screenshots

Under `apps/core/cardbey-core/tmp/phase3-browser-evidence/screenshots/` (gitignored evidence tree):

- Performer entry, fork card, Draft Review Shows, drawer, return, proposal, conflict, hide, mobile, flag-off

## Console / network notes

- Vite HMR websocket noise targeting `:5174` (non-blocking; app on `:5186`)
- Expected **403** cross-tenant; expected **409** `proposal_stale` on conflict accept
- CDN `example.test` image hosts → `ERR_NAME_NOT_RESOLVED` (fixture media URLs)

## Code fix applied during verification

Missing Phase 2 surface: **Review store content** was only handled on chip click, not offered in follow-up chips and not routed from free-text send.

- `ConsoleCentreColumn.tsx` — inject chip when flag + active store
- `usePerformerConsole.ts` — free-text goal routes to same handler
- Regression note in `performerContentEditingBridge.test.ts`

Separate corrective commit required (do not amend Phase 3 checkpoints).

## Cleanup

- Fixture businesses soft-marked `[DELETED_P3_FIXTURE]…` (`cleanup.json`)
- BB Flowers untouched: **confirmed**

## Why not full verified verdict

Manual drawer save and admin AoB-with-reason UI were not fully completed in-browser. Kill-switch (Dashboard + Core), proposal, conflict, hide/restore, and Performer→Draft Review path **were** exercised.

## Next for staging

After a corrective commit + completing drawer-save and admin AoB browser steps: re-run to seek  
`PHASE_3_LOCAL_BROWSER_VERIFIED_STAGING_DEPLOYMENT_REQUIRED`.  
Do not enable committed flag defaults; no push/merge/deploy from this authorization.
