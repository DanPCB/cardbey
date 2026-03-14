# E2E Store Creation – Implementation Summary

**Date:** 2026-03-04  
**Mission:** Finish Store Creation flow end-to-end (French Baguette test case). Campaign V2 **paused**.

---

## 1) Risk & Invariants (Locked Rule)

See **[docs/IMPACT_REPORT_E2E_STORE_CREATION.md](./IMPACT_REPORT_E2E_STORE_CREATION.md)** for full impact report. Summary:

- **Risks:** Changing DraftStore status writes (bypassing `transitionDraftStoreStatus`), changing publish contract, frontscreen reading draft, auth middleware order, removing publish idempotency, or changing category/preview shape.
- **Invariants:** All status writes via kernel transition service; AuditEvent for transitions; publish idempotent (already in `publishDraftService.js`); frontscreen reads published only; requireAuth on publish/draft-store; minimal diff, additive only.
- **Approach:** Additive only — contract doc, smoke script, health endpoint; no refactor of existing publish/draft pipeline.

---

## 2) Plan (Ordered Steps)

1. **Contract + docs + runner** — E2E contract file (steps 1–6, invariants, DoD); impact report; `pnpm run e2e:french-baguette`; README section.
2. **Health snapshot** — `GET /api/debug/store-creation-health` for DraftStore status, last N AuditEvents, last OrchestratorTask.
3. **No code changes** to publish pipeline, frontscreen, or auth in this pass — existing idempotency and routes retained; only additive artifacts added.

*(Further work — assets, preview/category fixes, frontscreen published-only verification — to be done in follow-up when specific failures are reproduced.)*

---

## 3) Implementation Summary (What Changed)

| Change | Rationale |
|--------|------------|
| **docs/E2E_STORE_CREATION_CONTRACT.md** | Single E2E contract: Steps 1–6, Definition of Done, invariants, constraints, reference spine. |
| **docs/IMPACT_REPORT_E2E_STORE_CREATION.md** | Locked-rule impact report: what could break, invariants, smallest safe approach, checklist. |
| **scripts/e2e-french-baguette.js** | Smoke runner: health check; with AUTH_TOKEN creates French Baguette job, polls SSE to completion, fetches draft; documents manual Steps 3–6. |
| **package.json (root)** | Added script: `e2e:french-baguette` → `node scripts/e2e-french-baguette.js`. |
| **apps/core/cardbey-core/package.json** | Added script: `e2e:french-baguette` → `node ../../scripts/e2e-french-baguette.js`. |
| **apps/core/cardbey-core/src/routes/debug.js** | New route: `GET /api/debug/store-creation-health?limit=5` — returns last N DraftStores (status, committedStoreId, generationRunId), last N AuditEvents (DraftStore/OrchestratorTask/Business), last OrchestratorTask. Dev-only. |
| **README.md** | New section “E2E Store Creation (French Baguette)” with contract link, smoke command, health endpoint, manual checklist; added E2E contract to Documentation list. |

**Not changed (by design):** `draftStoreService.js`, `publishDraftService.js`, `transitionService.js`, auth middleware, frontscreen or storefront API, dashboard publish/draft UI. Publish remains idempotent via existing `publishDraft` logic.

---

## 4) How to Test

### Commands (local)

1. **Start API** (from repo root or core):
   ```bash
   cd apps/core/cardbey-core && pnpm dev
   ```

2. **Health-only (no auth):**
   ```bash
   pnpm run e2e:french-baguette
   ```
   Expect: health check passes; message that full E2E requires AUTH_TOKEN.

3. **Full smoke (Steps 1–2) with auth:**
   ```bash
   AUTH_TOKEN=<your-jwt> BASE_URL=http://localhost:3001 pnpm run e2e:french-baguette
   ```
   Obtain JWT via login (e.g. `POST /api/auth/login`). Expect: job created, SSE completion, draft fetch attempted.

4. **Health snapshot (debug):**
   ```bash
   curl "http://localhost:3001/api/debug/store-creation-health?limit=5"
   ```
   Use to see which step is blocked (draft status, last events, last task).

### Manual checklist (Steps 1–6)

- **Step 1:** Create Store (French Baguette) with real auth (e.g. Quick Create → orchestra/start).
- **Step 2:** Add coffee product; upload or use fallbacks for avatar/hero.
- **Step 3:** Preview Store — categories, hero/avatar, product cards correct.
- **Step 4:** Publish Store — click Publish; click again; confirm no duplicate store/task (idempotent).
- **Step 5:** Frontscreen — open storefront; confirm it shows published store only, correct assets.
- **Step 6:** Smart Object promo via QR on cup works; loyalty program visible for store.

### Publish idempotency verification

- Publish the same draft twice (same `storeId` + `generationRunId`).
- **Expected:** Second response returns same `publishedStoreId` and 200; no second Business row; no duplicate tasks.
- **Implementation:** `publishDraftService.js` already returns existing store when `targetDraft.status === 'committed'` and `committedStoreId` set.

---

## 5) Touched Files (Brief Rationale)

| File | Rationale |
|------|-----------|
| `docs/E2E_STORE_CREATION_CONTRACT.md` | E2E contract and DoD. |
| `docs/IMPACT_REPORT_E2E_STORE_CREATION.md` | Risk and invariants per locked rule. |
| `docs/E2E_STORE_CREATION_IMPLEMENTATION_SUMMARY.md` | This summary and test instructions. |
| `scripts/e2e-french-baguette.js` | Smoke runner for Steps 1–2. |
| `package.json` | Root script `e2e:french-baguette`. |
| `apps/core/cardbey-core/package.json` | Core script `e2e:french-baguette`. |
| `apps/core/cardbey-core/src/routes/debug.js` | Health snapshot for store-creation debugging. |
| `README.md` | E2E section and contract link. |

---

## 6) Open Issues / Follow-ups

- **Assets (B):** Avatar/hero upload E2E and “use item image as hero” rule were not implemented in this pass; dashboard may already call upload endpoints — confirm backend routes and fallbacks.
- **Preview (C):** Category rendering and “latest draft” cache behavior were not changed; if Step 3 fails, fix with minimal patch (preview data source / category normalization).
- **Frontscreen (D):** No code change; confirm storefront API and frontscreen read from **published** snapshot only; if Step 5 fails, add minimal fix without draft dependency.
- **Smart Object / Loyalty (Step 6):** No code change; verify QR and loyalty visibility manually; if broken, fix in separate minimal PR.
- **CI:** No “E2E must be green” hook added; add to GitHub Actions or README-only manual gate as desired.
