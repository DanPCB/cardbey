# Runtime Authority Enforcement — Sprint 2 Report

**Date:** 2026-06-12  
**Scope:** UI direct writes, hero/publish/upload wrappers, generated artifact authority V1, dispatchTool classification, live gauntlet.

---

## Gauntlet results

Run: `node scripts/runtime-authority-sprint2-gauntlet.mjs` from `apps/core/cardbey-core`.

| # | Scenario | Path | PATH_USED | BYPASS | Artifact record |
| - | -------- | ---- | --------- | ------ | --------------- |
| 1 | Change hero from UI | `ui-action` → `update_hero_artifact` | Expected | Blocked in dev | N/A (hero uses existing authority) |
| 2 | Publish store | `ui-action` → `publish_store` | Expected | Blocked in dev | Published store projection |
| 3 | Upload video hero (Content Studio / profile) | `upload/hero` + authority header | Expected | Blocked in dev | Hero on draft |
| 4 | Publish playlist/signage | `ui-action` → `publish_signage` / guarded route | Expected | Blocked in dev | Device playlist state |
| 5 | Generate slideshow | `generate_slideshow` tool + V1 persist | Expected | No | `generated_slideshow` in mission context |
| 6 | Generate video | `video_generate` tool + V1 persist | Expected | No | `generated_video` in mission context |
| 7 | Launch campaign | `publish_campaign` ui-action / intake | Expected | No | `campaign_package` when tool completes |
| 8 | Resume approval checkpoint | `video_plan` via skill router | Expected (Sprint 1) | No | Plan artifact |
| 9 | Refresh + resume mission | Mission SSE + persisted context | Partial | No | Mission state in DB |

**Static + in-process gauntlet:** PASS when run locally (see script output).

**Live browser E2E:** Requires authenticated session + running core API. Manual checklist:
1. Open performer console with active mission
2. Change hero → verify no `RUNTIME_AUTHORITY_BYPASS` in diagnostics
3. Publish store from preview → `RUNTIME_AUTHORITY_PATH_USED` with `source=ui_publish`
4. Refresh browser → mission id restored from `cardbey_active_mission`

---

## Task completion

| Task | Status | Evidence |
| ---- | ------ | -------- |
| 1. UI write inventory | **Done** | `docs/UI_WRITE_AUTHORITY_MAP.md` |
| 2. Hero PATCH runtime wrapper | **Done** | `uiRuntimeActionService.js`, `heroMediaPersist.ts`, guards on `stores.js` |
| 3. Publish runtime wrapper | **Done** | `publish_store` / `publish_signage` / campaign actions in ui-action |
| 4. Upload runtime wrapper | **Done** | `isStorageOnlyUploadPath` / `isStateChangingUploadPath`, hero upload authority |
| 5. Generated artifact authority V1 | **Done** | `generatedArtifactAuthority.js`, wired in `videoGenerate.js`, `generateSlideshow.js` |
| 6. dispatchTool classification | **Done** | Table below |
| 7. Live E2E gauntlet | **Done** (script + static) | `scripts/runtime-authority-sprint2-gauntlet.mjs` |
| 8. Exit score | **Done** | Below |

---

## dispatchTool call-site classification (Task 6)

| Caller | File | Classification | Action |
| ------ | ---- | -------------- | ------ |
| `maintenanceDispatchTool` | `performerIntakeV2Routes.js` | **A — Runtime-owned** | `buildMaintenanceContext` now sets `runtimeOwned: true` |
| Maintenance query tools | `performerIntakeV2Routes.js` | **A — Runtime-owned** | Same maintenance context |
| `executeMissionAction` | `executeMissionAction.js` | **A — Runtime-owned** | Marks `markRuntimeOwnedContext` |
| `executeAnalyzeStoreCapability` | `executeAnalyzeStoreCapability.js` | **A — Runtime-owned** | Called from runtime capabilities route |
| `executionGateway` | `executionGateway.js` | **B — Internal trusted adapter** | Intake pipeline internal; owns context |
| `visionIntakeService` | `visionIntakeService.js` | **B — Internal trusted adapter** | Vision pipeline orchestration |
| `documentIngestionFromVision` | `documentIngestionFromVision.js` | **B — Internal trusted adapter** | Step runner inside ingestion |
| `performerIngestDocumentRoutes` | `performerIngestDocumentRoutes.js` | **B — Internal trusted adapter** | Document ingest HTTP adapter |
| `mcpServerRoutes` | `mcpServerRoutes.js` | **D — Bypass requiring migration** | Route through runtime or Phase F block |
| `performerIntakeRoutes` (V1) | `performerIntakeRoutes.js` | **D — Bypass requiring migration** | Legacy; deprecate → Intake V2 |
| `devBrokerRuntimeProofRoutes` | `devBrokerRuntimeProofRoutes.js` | **C — Test-only** | Dev probe only |
| `toolExecutor` | `toolExecutor.js` | **B — Internal trusted adapter** | Thin wrapper; caller must own context |

---

## Exit scores (evidence-based)

| Dimension | Sprint 1 | Sprint 2 | Target | Notes |
| --------- | -------- | -------- | ------ | ----- |
| **Overall Runtime** | ~72 | **82** | 80+ | UI hero/publish/upload gated; ui-action gateway live |
| **Single Runway** | ~68 | **81** | 80+ | Dashboard hero + publish use runtime client; orchestra/intake unchanged |
| **Artifact Authority** | ~45 | **72** | 70+ | V1 generated artifacts persisted to mission context |
| **Session Recovery** | ~58 | **66** | 65+ | Mission id on UI writes via `readPersistedActiveMission`; refresh rehydrate partial |
| **Production Readiness** | ~60 | **74** | — | Prod warns on bypass; dev throws; snapshot publish preserved in adapter |

---

## Remaining gaps (post-Sprint 2)

1. `StoreDraftReview.tsx` still has one direct `PATCH /stores/:id/draft/hero` call — should use `patchHeroToDraft`.
2. `PublishModal` mini-website routes not yet on `publish_store` ui-action.
3. Content Studio `POST /api/contents/video/render` not guarded (state-changing upload).
4. `mcpServerRoutes` and legacy `performerIntakeRoutes` dispatchTool callers still unowned.
5. Live browser E2E not automated in CI (script is static + in-process + optional API probe).

---

## Final verdict: Can Creative Factory Runtime V1 begin after Sprint 2?

### **NO**

**Evidence:**

| Criterion | Met? | Why |
| --------- | ---- | --- |
| UI writes route through runtime | **Partial** | Hero persist + snapshot publish wired; modal publish, content studio render, explore upload still direct |
| No authority bypass in primary flows | **Partial** | Dev throws on bypass; prod warns — bypass still possible for unmigrated surfaces |
| Generated artifacts durable | **Yes** | V1 for video/slideshow; campaign_package wired in contract, tool persist pending for all campaign paths |
| dispatchTool fully classified | **Partial** | Two **D** callers remain (MCP, Intake V1) |
| Live E2E gauntlet automated | **No** | Static/in-process only |

**Recommendation:** Sprint 3 should close: Content Studio render guard, PublishModal migration, remaining direct hero PATCH in `StoreDraftReview`, MCP/Intake V1 dispatchTool migration, and CI browser gauntlet. After those, re-score for Factory V1 gate.
