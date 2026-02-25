# Step 9 Readiness Audit — DONE Report

**Date:** 2026-02-12  
**Scope:** Real MI wiring safety + expansion checklist. No spine/endpoint/behavior changes; safeguards, diagnostics, tests, and docs only.

---

## 1) Risk check recap (spine unchanged)

- **Automation spine:** No changes. The following were **not** modified:
  - `POST /api/mi/orchestra/start`
  - `GET /api/stores/temp/draft?generationRunId=...`
  - `PATCH /api/draft-store/:draftId`
  - `POST /api/store/publish`
  - `GET /api/store/:id/preview`
- **Backend:** No endpoint, request/response shape, auth, or routing changes.
- **No:** polling/timers, calls to `POST /api/mi/orchestra/job/:id/run`, or `POST /api/store/publish`. Writes remain limited to the Step 8 gate (tags only).

---

## 2) Audit findings

### A) Write surface area audit

| Search target | Locations | Finding |
|---------------|-----------|--------|
| `miPatch(` | `miExecutor.ts` (call), `miHttp.ts` (definition) | **Only** call site is `RealExecutor.execute()` at line ~215, reached only when `intent === 'tags'`, `isMIExecutorWriteEnabled()`, `effectiveDraftId` set, and `buildTagsPatchBody(draftRaw)` non-null. |
| `/api/draft-store/` | Many (orchestra, onboarding, draft resolver, StorePreviewPage, etc.) | Only **miPatch** to draft-store is in the executor (tags branch). Other callers use `apiGET`/`apiPATCH` (different code paths). |
| `isMIExecutorWriteEnabled(` | `miExecutor.ts`, `miExecutorWriteGate.ts`, tests | Used only in executor and gate; no other callers. |
| `localStorage cardbey.miExecutorWrites` | `miExecutorWriteGate.ts`, tests | Only read in gate; no other readers. |

**Conclusion:** The **only** path that calls `miPatch` is the real executor branch where `intent === 'tags'`. Audit **PASS**. No other callers; no fix required.

---

## 3) File diffs summary

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutor.ts` | Added `MIExecutionDebugEvent` and optional `debugEvent` on result; when gate ON and `intent !== 'tags'`, return with `debugEvent: { type: 'write_blocked', intent, reason: 'intent_not_tags' }` (no PATCH). |
| `apps/dashboard/cardbey-marketing-dashboard/src/state/miHelperStore.ts` | Extended `MIDebugEvent.type` with `'write_blocked'`; added optional `reason`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miCommands.ts` | After pushing `executor_result`, if `result.debugEvent?.type === 'write_blocked'`, push a `write_blocked` debug event. |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` | MI Console shows `reason=` for `write_blocked` events. |
| `apps/dashboard/cardbey-marketing-dashboard/tests/miTagsPatch.test.ts` | **New.** Tests for `buildTagsPatchBody`: realistic draft fixture, same item count, tags `string[]` and capped (max 5), no dropped items. |
| `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx` | Added: (1) Step 9 test — gate ON + intent not tags → `write_blocked` event, no PATCH; (2) Step 9 test — no forbidden calls (no POST, no job/run, no publish). |
| `docs/MI_UNIFIED_HELPER.md` | Added **Step 9 — Manual readiness checklist**: how to enable real mode and writes, expected vs forbidden network calls, rollback file list. |

---

## 4) Tests run + results

**Command:**
```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/miTagsPatch.test.ts tests/MIUnifiedHelper.test.tsx tests/miExecutorWriteGate.test.ts tests/miExecutorMode.test.ts tests/miHelperStore.test.ts
```

**Results:**
- `tests/miTagsPatch.test.ts`: **6 passed** (buildTagsPatchBody: null cases, item count, no dropped items, tags capped, id/name preserved, nested draft.preview).
- `tests/MIUnifiedHelper.test.tsx`: **25 passed** (includes Step 9: write_blocked when gate ON + intent ≠ tags; Step 9: no forbidden calls).
- `tests/miExecutorWriteGate.test.ts`: **4 passed**
- `tests/miExecutorMode.test.ts`: **4 passed**
- `tests/miHelperStore.test.ts`: **12 passed**

**Total:** 51 tests passed (31 in the subset run: 6 + 25).

---

## 5) Manual checklist (Step 9)

- **Enable real mode + writes (dev):**  
  `localStorage.setItem('cardbey.miExecutor', 'real')` and `localStorage.setItem('cardbey.miExecutorWrites', 'true')`.
- **Expected network:** GET auth/me, GET draft-store (by id / by-store / temp), and when intent tags + gate on: one PATCH draft-store/:draftId.
- **Must NOT appear:** POST (any), `/api/mi/orchestra/job/` + `/run`, publish endpoint.
- Full checklist: see `docs/MI_UNIFIED_HELPER.md` section **Step 9 — Manual readiness checklist**.

---

## 6) Rollback plan

One-commit revert of Step 9 changes. Files to revert:

1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutor.ts` (debugEvent type + write_blocked branch)
2. `apps/dashboard/cardbey-marketing-dashboard/src/state/miHelperStore.ts` (MIDebugEvent type + reason)
3. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miCommands.ts` (push write_blocked)
4. `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` (write_blocked console line)
5. `apps/dashboard/cardbey-marketing-dashboard/tests/miTagsPatch.test.ts` (delete or revert)
6. `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx` (remove Step 9 tests)
7. `docs/MI_UNIFIED_HELPER.md` (remove Step 9 checklist section)
8. `docs/STEP9_READINESS_AUDIT_DONE.md` (this file; optional to remove)

After revert, Step 8 behavior is unchanged; only the extra guard, debug event, tests, and docs are removed.
