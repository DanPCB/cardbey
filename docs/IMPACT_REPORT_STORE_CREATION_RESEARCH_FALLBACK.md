# Impact Report: Store creation Needs attention (research + bulkhead)

## Symptom

After store input, mission shows **Needs attention** / empty execution history.
Local can still progress (catalog / images) while logging:
`[CreateStoreDispatch] async intake pipeline failed: Bulkhead llm_operations timeout (30000ms)`.

## Causes (stacked)

1. **Research throw** (fixed in `e701395`) — `buildCatalogForStoreReactStep` had no try/catch → `GENERATE_DRAFT_FAILED`.
2. **Bulkhead wrap** — `executeRuntimeAction` ran `create_store` under `llm_operations` (30s). Store draft work takes minutes. Timeout rejects the outer promise (deferred catch logs only) and **double-`cleanup`** undercounts concurrency. Under live load this can amplify races / confused mission state.

## Smallest safe patches

1. Research: try/catch → template/preloaded catalog (`draftStoreService.js`) — shipped `e701395`.
2. Bulkhead: do **not** wrap `create_store` / `create_campaign` in `llm_operations`; harden settle-once in `bulkhead.js`.
3. Pass through `auditSource` from runtime context in `create_store.js` (intake vs proactive).

## Scope

- `executeRuntimeAction.js`, `bulkhead.js`, `create_store.js`, reliability test
- Does not change draft publish, checkpoint UX, or researchEvidence package (still local-only)

## Verify after deploy

1. Render `cardbey-core` Events shows this commit live.
2. **New** create-store (do not rely on an already-failed mission).
3. Logs should **not** show bulkhead timeout for create_store; mission should stay `executing` through catalog/images.
