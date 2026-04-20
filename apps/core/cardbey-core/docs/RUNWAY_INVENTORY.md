# Runway inventory — store build entry paths (Phase 0)

**Purpose:** Single map of every path that can start or continue a **store / mini-website draft build** (`build_store` / `executeStoreMissionPipelineRun` family).  
**Status:** Forensic snapshot; no behavior change implied.  
**Related:** `CONTRACT_V1.md`, golden fixtures under `src/lib/contracts/__fixtures__/golden/`.

---

## Canonical five runways (Phase 1 golden coverage)

| ID | Runway | Entry (HTTP / caller) | Primary module(s) | Creates task via | Creates / patches draft via |
|----|--------|----------------------|-------------------|----------------|------------------------------|
| R1 | **Intake V2 — shortcut** | `POST` performer intake V2 (shortcut `create_store`) | `src/routes/performerIntakeV2Routes.js` | `executeStoreMissionPipelineRun` → `createBuildStoreJob` | `createBuildStoreJob` + patch in `executeStoreMissionPipelineRun` |
| R2 | **Intake V2 — autosubmit** | Same route, `create_store` + `_autoSubmit` | `performerIntakeV2Routes.js` | Same | Same |
| R3 | **Mission pipeline run** | `POST /api/missions/:id/run` (store mission) | `src/routes/missionsRoutes.js` → `executeStoreMissionPipelineRun` | `createBuildStoreJob` | Same |
| R4 | **MI orchestra start** | `POST /api/mi/orchestra/start` | `src/routes/miRoutes.js` (`handleOrchestraStart`) | `createBuildStoreJob` (`skipDraft: true`; same `task.request` factory as R1–R3) | `createBuildStoreJob` (unified factory; `draftInput` carries `baseInput`) |
| R5a | **Business API** | `POST /api/business/create` (orchestra shape) | `src/routes/business.js` | `createBuildStoreJob` | `createBuildStoreJob` |
| R5b | **Operator tool** | `start_build_store` (in-process) | `src/ai/operator/tools/index.js` | `createBuildStoreJob` | `createBuildStoreJob` |

**Note:** R5a and R5b share the same factory today but accept different parameter breadth; Phase 1 treats them as **two golden scenarios** from a contract perspective (structured API vs operator params).

---

## Field handoff summary (known drift)

| Source names | Downstream names | Risk |
|--------------|------------------|------|
| Intake `storeName` | `businessName` in `executeStoreMissionPipelineRun` body | Drop if only `storeName` passed to mission run without mapping |
| Intake `cleanedParams` | Mission `metadataJson` + run `body` | Must stay in sync for retries |
| Orchestra `bodyRequest.location` vs `req.body.location` | `task.request` vs `draft.input` | Split-brain location |
| Business `payload.location` | Passed to `createBuildStoreJob` as `location` (Phase 1) | Re-verify worker reads structured `location` end-to-end |

---

## Execution sink (all runways)

**Final worker:** `runBuildStoreJob` in `src/services/draftStore/orchestraBuildStore.js`  
**Reads:** `DraftStore.input` ∪ `OrchestratorTask.request` (merged in worker).

---

## Phase 2 (Option A) — implemented

All runways that need a new `build_store` task + draft use **`createBuildStoreJob` (single factory)** so `task.request` and `draft.input` shapes match `BuildStoreInputV1` from `CONTRACT_V1.md`. R4 draft creation runs through the same factory (`draftInput` / `guestDraft` / `draftMode`; second call uses `existingJobId` + `generationRunId` after the `skipDraft: true` task row).
