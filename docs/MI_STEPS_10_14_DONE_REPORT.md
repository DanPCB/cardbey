# MI “One Helper” Workflow — Steps 10–14 DONE Report

**Date:** 2026-02-12  
**Scope:** Finish MI one-helper workflow: rewrite (draft-only) write, UI refresh after PATCH, tests, docs. Safe and reversible.

---

## 1) Risk check recap

- **Spine unchanged:** No changes to:
  - POST /api/mi/orchestra/start
  - GET /api/stores/temp/draft?generationRunId=...
  - PATCH /api/draft-store/:draftId (existing usage; only behind strict gates)
  - POST /api/store/publish
  - GET /api/store/:id/preview
- **No forbidden calls added:** No POST to `/api/mi/orchestra/job/:id/run`, no automatic publish, no new polling/timers/intervals.
- **All new writes:** Draft-only, behind real executor + intent-specific gate (tags: `cardbey.miExecutorWrites`; rewrite: `cardbey.miExecutorWrites.rewrite`).

---

## 2) File diffs summary

| File | Change |
|------|--------|
| `src/lib/mi/miExecutorWriteGate.ts` | Added `WRITES_KEY_REWRITE`, `isMIExecutorWriteEnabledFor(intent)` — tags uses existing key, rewrite uses `.rewrite`. |
| `src/lib/mi/miRewritePatch.ts` | **New.** `buildRewritePatchBody(draftRaw, context)` — deterministic rewrite, descriptions capped 140 chars. |
| `src/lib/mi/miExecutor.ts` | Allowlist `['tags','rewrite']`; intent-specific gate; rewrite branch with `buildRewritePatchBody` + PATCH; `write_blocked` reason `intent_not_allowed` for non-allowlist; `patchPreview` in output on success. |
| `src/state/miHelperStore.ts` | `MIDebugEvent.type` + `'patch_preview'`; `MIPatchPreviewMeta`; optional `patchPreview` on event. |
| `src/lib/mi/miCommands.ts` | Push `patch_preview` debug event when `result.output.patchPreview` present. |
| `src/features/mi/MIHelperPanel.tsx` | Status: rewrite success “Real (draft updated): descriptions rewritten.”; rewrite gate off “Writes disabled for rewrite.”; console shows `patch_preview` (itemCount, fieldsChanged). |
| `src/features/storeDraft/StoreDraftReview.tsx` | **Step 11:** Effect: when `lastResult` indicates successful PATCH (`patchDraft` in checked), call `onRefresh()` once (ref guards against duplicate). |
| `tests/miExecutorWriteGate.test.ts` | Tests for `isMIExecutorWriteEnabledFor('tags')`, `('rewrite')`, unknown. |
| `tests/miRewritePatch.test.ts` | **New.** buildRewritePatchBody: item count, only descriptions changed, capped length, nested draft.preview. |
| `tests/MIUnifiedHelper.test.tsx` | Step 9 write_blocked reason → `intent_not_allowed`; Step 10: rewrite gate OFF (no PATCH, message); Step 10: rewrite gate ON (PATCH once, body descriptions, no forbidden calls); afterEach clear `cardbey.miExecutorWrites.rewrite`. |
| `docs/MI_UNIFIED_HELPER.md` | Step 10 section (rewrite gate, allowlist table, enable in dev, troubleshooting); Tests section updated; run command includes miRewritePatch.test.ts. |
| `docs/MI_STEP10_REWRITE_WRITE.md` | **New.** Summary, risk, rollback file list. |

---

## 3) Behavior changes

- **Rewrite intent:** With real executor and `cardbey.miExecutorWrites.rewrite` = `'true'`, Send with intent `rewrite` performs one PATCH to draft-store with updated item descriptions (deterministic, no LLM, max 140 chars per description).
- **Write allowlist:** Only `tags` and `rewrite` can PATCH; any other intent gets read-only + optional `write_blocked` with reason `intent_not_allowed` when any write gate is on.
- **UI after PATCH:** After a successful tags or rewrite PATCH, StoreDraftReview calls `onRefresh()` once so the draft preview can refetch (single GET, no polling).
- **Panel status:** Rewrite-specific messages for “draft updated: descriptions rewritten” and “Writes disabled for rewrite.”
- **Debug:** `patch_preview` event with intent, draftId, itemCount, fieldsChanged (no full text).

---

## 4) Tests run + results

**Command:**
```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/miHelperStore.test.ts tests/miExecutorMode.test.ts tests/miExecutorWriteGate.test.ts tests/miTagsPatch.test.ts tests/miRewritePatch.test.ts tests/MIUnifiedHelper.test.tsx
```

**Results:** 60 tests passed (miExecutorMode 4, miTagsPatch 6, miRewritePatch 6, miExecutorWriteGate 7, miHelperStore 10, MIUnifiedHelper 27).

---

## 5) Manual verification steps

1. **Rewrite gate OFF:** Set `cardbey.miExecutor` = `'real'`. Do not set `cardbey.miExecutorWrites.rewrite`. Open panel, set intent rewrite (e.g. “Rewrite descriptions” suggestion), Send. Expect: status “Writes disabled for rewrite”, no PATCH in network.
2. **Rewrite gate ON:** Set `cardbey.miExecutorWrites.rewrite` = `'true'`. Same flow. Expect: one PATCH to `/api/draft-store/:draftId` with body containing `preview.items[].description`. Status “Real (draft updated): descriptions rewritten.”
3. **UI refresh:** After successful PATCH, confirm draft review refreshes (one extra GET if page uses `onRefresh`).
4. **No forbidden calls:** In network tab, confirm no POST, no `/api/mi/orchestra/job/` + `/run`, no publish.

---

## 6) Rollback plan

One-commit revert. Full file list in `docs/MI_STEP10_REWRITE_WRITE.md`. Summary: revert `miExecutorWriteGate.ts`, delete `miRewritePatch.ts`, revert `miExecutor.ts` (allowlist + rewrite branch), revert store/commands/panel/StoreDraftReview changes, revert/remove tests and docs for Step 10/11.

---

## 7) Confirmations

- **Spine unchanged:** Yes.
- **No forbidden calls added:** Yes.
- **No new polling/timers:** Yes (single-shot refetch only).
