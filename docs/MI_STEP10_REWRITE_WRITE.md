# Step 10 — Rewrite descriptions (draft-only write)

## Summary

- **Intent:** `rewrite`
- **Gate:** `localStorage` key `cardbey.miExecutorWrites.rewrite` = `'true'` (dev) or env `VITE_ENABLE_MI_EXECUTOR_WRITES_REWRITE=true`
- **Behavior:** When executor is real and rewrite gate is on, Send with intent `rewrite` runs GET auth/me + GET draft-store, then **one** PATCH `/api/draft-store/:draftId` with a body that updates only `description` on each item. Deterministic local rewrite (no LLM); descriptions capped at 140 chars.

## Risk

- **Spine unchanged:** Same endpoints as Step 8. No new routes, no POST/run/publish, no polling.
- **Draft-only:** Writes go only to draft-store PATCH. No publish, no job/run.

## Rollback (one-commit revert)

Revert the following files to remove Step 10 (and optionally Step 11) changes:

1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutorWriteGate.ts` — remove `isMIExecutorWriteEnabledFor`, `WRITES_KEY_REWRITE`
2. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miRewritePatch.ts` — delete file
3. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutor.ts` — remove rewrite branch, restore single-intent (tags) flow and `intent_not_tags` write_blocked reason
4. `apps/dashboard/cardbey-marketing-dashboard/src/state/miHelperStore.ts` — remove `patch_preview` type and `MIPatchPreviewMeta` if only used for Step 10
5. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miCommands.ts` — remove patch_preview debug push
6. `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` — remove rewrite status line and patch_preview console line
7. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` — remove Step 11 effect (lastResult/lastRunAt refetch)
8. `apps/dashboard/cardbey-marketing-dashboard/tests/miExecutorWriteGate.test.ts` — remove Step 10 tests for `isMIExecutorWriteEnabledFor`
9. `apps/dashboard/cardbey-marketing-dashboard/tests/miRewritePatch.test.ts` — delete file
10. `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx` — remove Step 10 rewrite tests; restore Step 9 write_blocked reason to `intent_not_tags` if reverting executor
11. `docs/MI_UNIFIED_HELPER.md` — remove Step 10 section and write allowlist table
12. `docs/MI_STEP10_REWRITE_WRITE.md` — delete this file

After revert, Step 8 (tags-only write) remains; rewrite and single-shot refetch are removed.
