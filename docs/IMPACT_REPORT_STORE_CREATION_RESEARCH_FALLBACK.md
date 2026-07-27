# Impact Report: Store creation Needs attention (deferred fire-and-forget)

## Latest live evidence (`cmrc7u6kz…`)

- Mission ID pinned correctly (`requestMissionId === activeMissionId`)
- `draftStoreId: null` for the whole session
- Inspector: `3 steps · 0 of 3`, empty execution history, “confirm choices…” copy
- Render logs after deploy: health only — **no** create-store / generateDraft for this mission
- `orchestraMirror reconciliation scan: 3 stale pipelines` on boot

## Root cause

Intake **defers** `executeMission(checkpoint_pipeline)` with `void … .catch(console.error)` and immediately returns `store_mission_started` **without a draftId**.

That work is **in-process only**. A Render deploy/restart (or process kill) drops it. The mission row + pending `structured_store_build` survive; draft never starts → UI Needs attention / 0 of 3.

Prior fixes remain valid but insufficient alone:

1. `e701395` — research try/catch  
2. `6c1252d` — do not wrap create_store in 30s llm bulkhead  

## Smallest safe patch (this change)

1. Persist deferred run request on `MissionPipeline.metadataJson.deferredStorePipeline`
2. Background runner marks soft failures / throws as mission `failed` + execution FAILED event
3. Boot + periodic worker: `resumeOrphanedDeferredStorePipelines` for store missions with pending/failed `structured_store_build` and no `draftId` (incl. re-queue previously failed orphans)
4. orchestraMirror: skip reconcile when structured store build is still pending and no OrchestratorTask

## Scope

- `deferredStorePipelineRunner.js` (new)
- `createStoreCheckpointDispatch.js`, `backgroundWorkers.js`, `orchestraMirror.js`
- Does not change draft publish, governance checkpoints, or researchEvidence package

## Verify after deploy

1. Render `cardbey-core` Events shows this commit live
2. Logs: `[DeferredStorePipeline] resuming orphan` and/or draft/catalog progress for orphaned store missions
3. New create-store: draft id appears without needing a second deploy mid-run
4. Stuck missions without draft may auto-resume ~15s after boot (or start a fresh create-store)
