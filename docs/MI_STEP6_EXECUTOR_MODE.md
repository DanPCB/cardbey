# Step 6 — Executor Mode (Feature-Flagged) — Risk Check & Rollback

**Scope:** Dashboard only. No backend. No spine.

## Risk check

| Check | Status |
|-------|--------|
| No spine endpoint changes | ✅ No changes to POST /api/mi/orchestra/start, GET /api/stores/temp/draft, PATCH /api/draft-store/:draftId, POST /api/store/publish, GET /api/store/:id/preview |
| No new polling/timers | ✅ None added |
| Additive, reversible | ✅ New file miExecutorMode.ts; small diffs in executor, commands, panel, tests |
| Default dry_run only | ✅ getMIExecutorMode() returns 'dry_run' unless VITE_MI_EXECUTOR_MODE=real or VITE_ENABLE_MI_EXECUTOR=true or localStorage override in DEV |
| RealExecutor no network by default | ✅ RealExecutor returns safe no-op (no backend wired); no fetch/orchestra call |

## Flags

- **VITE_MI_EXECUTOR_MODE**: `"dry_run"` \| `"real"` — default `dry_run`
- **VITE_ENABLE_MI_EXECUTOR**: `"true"` \| `"false"` — when `"true"`, enables real mode if mode is also set
- **localStorage `cardbey.miExecutor`** (DEV only): `"dry_run"` \| `"real"` — overrides env for local testing

## Manual verification

1. Default: Open panel, Send → Status “Dry run”, `mi-exec-mode` shows dry_run. Network tab: no new requests.
2. Real mode: Set `localStorage.setItem('cardbey.miExecutor', 'real')`, refresh, Send → `mi-exec-mode` shows real; result message explains no backend wired. Network tab: no new requests (RealExecutor does not call any endpoint).
3. Reset: `localStorage.removeItem('cardbey.miExecutor')`.

## Rollback plan

Revert (or delete) in this order:

1. **docs/MI_UNIFIED_HELPER.md** — Remove Step 6 section; revert Test IDs and Tests list; revert Debugging / MI Console wording if needed.
2. **docs/MI_STEP6_EXECUTOR_MODE.md** — Delete file.
3. **tests/MIUnifiedHelper.test.tsx** — Remove `cardbey.miExecutor` from afterEach; remove Step 6 tests (default executor mode, real mode without fetch); remove `lastResult?.executor` assertion from Step 5 test.
4. **tests/miExecutorMode.test.ts** — Delete file.
5. **src/features/mi/MIHelperPanel.tsx** — Remove `getMIExecutorMode` import and `mi-exec-mode` badge; restore single `mi-exec-status` block; revert console render for `executor_result` / `resultMessage` / `resStatus`.
6. **src/lib/mi/miCommands.ts** — Remove `getMIExecutorMode`, `RealExecutor`; restore `getMIExecutor()` to always return `DryRunExecutor`; remove `executor_result` pushDebugEvent in try/catch; ensure failed result still has `executor` if type requires it (or revert MIExecutionResult to optional executor).
7. **src/lib/mi/miExecutor.ts** — Remove `RealExecutor`, `ExecutorKind`; remove `executor` from `MIExecutionResult` and from `DryRunExecutor` return.
8. **src/state/miHelperStore.ts** — Remove `executor_result` from `MIDebugEvent.type`; remove `status`, `resultMessage` from MIDebugEvent.
9. **src/lib/mi/miExecutorMode.ts** — Delete file.
