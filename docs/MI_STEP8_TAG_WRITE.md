# Step 8 — Real executor draft-only writes (tags)

## Summary

Real mode can perform a **single** gated write: PATCH `/api/draft-store/:draftId` when intent is `tags` and the write gate is enabled. Draft-only; no publish, no job run. Reversible by reverting the changed files.

## Risk check

- **Spine unchanged:** POST orchestra/start, GET temp/draft, PATCH draft-store, POST publish, GET preview are **not** modified in contract or behavior. Step 8 only **calls** PATCH draft-store when gate + intent allow it; same endpoint, merge-friendly body.
- **Forbidden:** No POST to `/api/mi/orchestra/job/:id/run`, no POST to `/api/store/publish`, no new polling/timers/routes.
- **Scope:** Changes are in MI executor module, `miHttp` (miPatch), write gate, tags-patch helper, panel status copy, tests, and docs. No changes to spine callers or orchestration flow.

## Gates

1. **Executor mode real:** `cardbey.miExecutor=real` or env (Step 6).
2. **Write gate:** `VITE_ENABLE_MI_EXECUTOR_WRITES=true` or (DEV) `localStorage.setItem('cardbey.miExecutorWrites', 'true')`. Default **off**.

## Rollback (file list)

Revert these files to undo Step 8:

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutorWriteGate.ts` | New file — delete |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miHttp.ts` | Remove `miPatch` and `MiPatchResult` |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miTagsPatch.ts` | New file — delete |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutor.ts` | Remove tags path, write gate, miPatch; restore Step 7-only RealExecutor |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` | Restore simple status row (remove Step 8 status labels) |
| `apps/dashboard/cardbey-marketing-dashboard/tests/miExecutorWriteGate.test.ts` | New file — delete |
| `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx` | Remove Step 8 tests and `cardbey.miExecutorWrites` cleanup |
| `docs/MI_UNIFIED_HELPER.md` | Remove Step 8 section and write-gate test from Tests |
| `docs/MI_STEP8_TAG_WRITE.md` | This file — delete |
| `docs/MI_STEP8_RISK_AUDIT.md` | Optional working notes — delete if present |

After rollback, real mode behaves as Step 7 only (read-only GET checks, no PATCH).
