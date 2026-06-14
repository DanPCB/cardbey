# Creative Factory V3 Report

**Date:** 2026-06-12  
**Factory ID:** `creative_asset_factory_v3`  
**Flag:** `ENABLE_CREATIVE_FACTORY_V3=false` (default)  
**Fallback:** V3 → V2 → V1 via `resolveCreativeFactoryId()`

---

## Objective

Upgrade Creative Factory V2 into a MoneyPrinter-style production workflow (subtitles, music, final review, publish handoff) **inside the hardened Factory Runtime** — no new runtime, no Performer bypass, no auto-publish.

---

## V3 architecture

```
research → script → asset_search → video_plan
  → plan approval (awaiting_factory_approval)
  → execute (video_generate_multimodal)
  → subtitle → music_selection
  → final_asset_review (awaiting_final_asset_approval)
  → publish_handoff → artifact_finalize
```

| Layer | Implementation |
|-------|----------------|
| Definition | `factories/creativeAssetFactoryV3.js` |
| V2 pipeline handlers | Reused via `factoryStageHandlerRegistry` (research–video_plan) |
| V3 stage handlers | `creativeFactoryV3Stages.js` (subtitle, music_selection, publish_handoff) |
| Intent routing | `factoryBootstrap.js` — `resolveCreativeFactoryId()` priority |
| Multi-checkpoint approval | Platform extension: `approvalKind` on stages + `resumedApprovalStageId` |
| Artifacts | `generatedArtifactAuthority` — subtitle, music, final bundle |

**No factory-specific executor branches.** V3 added via definition + handler registry + bootstrap only.

---

## Stage outputs

| Stage | Key outputs |
|-------|-------------|
| `research` | `researchBrief` |
| `script` | `scriptDraft` |
| `asset_search` | `assetCandidates` |
| `video_plan` | `videoPlan` |
| `approval` | pause — plan merge at `stageOutputs.video_plan.videoPlan` |
| `execute` | `videoUrl`, `artifact` |
| `subtitle` | `subtitleArtifact` (SRT/VTT payload), `srtContent`, `lines` |
| `music_selection` | `musicSelection`, `musicArtifact` |
| `final_asset_review` | pause — `awaiting_final_asset_approval` |
| `publish_handoff` | `publishOptions[]`, `finalBundle` |
| `artifact_finalize` | `final_creative_asset` via `artifactPolicy` |

### Subtitle V3 (minimum)

- Lines from `voiceoverCopy` / plan script
- Timing: even split across estimated duration (scene sum or 30s default)
- SRT + VTT sidecar in artifact payload — **no burn-in** (no ffmpeg subtitle path in core today)
- Non-fatal: persist failure returns fallback output without failing factory

### Music V3 (minimum)

- `MiMusicTrack` catalog match on mood/tone
- Fallback: `VIDEO_MUSIC_BED_URL` via `musicBed.js`
- Final fallback: silence metadata (`source: 'silence'`)

### Publish handoff (no auto-publish)

`publishOptions`: Content Studio, store, signage/playlist, share/export, campaign — user chooses later.

---

## Second approval model

| Checkpoint | Status | `approvalKind` | User actions |
|------------|--------|----------------|--------------|
| Plan (pre-execute) | `awaiting_factory_approval` | `plan` | Approve / Cancel |
| Final asset (post-music) | `awaiting_final_asset_approval` | `final_asset` | Approve / Regenerate video / Cancel |

**Platform changes (generic, not V3-specific):**

- `factoryDefinition` — optional `approvalKind` on `requiresApproval` stages
- `factoryRuntimeExecutor` — pause status from `approvalKind`; resume skips only `resumedApprovalStageId`
- `factoryApprovalService` — loads both pending statuses; `decision: 'regenerate'` rewinds to `execute`

Regenerate clears outputs from `execute` onward — does not restart research/script/asset search.

---

## Artifact authority

| `artifactType` | Persisted by |
|----------------|--------------|
| `generated_video` | execute stage / existing finalize path |
| `generated_subtitle` | subtitle stage |
| `generated_music_selection` | music_selection stage |
| `final_creative_asset` | artifact_finalize (`sourceStageIds: publish_handoff, execute`) |

All records land in `mission.context.generatedArtifacts` via `registerGeneratedArtifactV1`.

---

## Console UI

`FactoryConsoleCard` V3 panels (gated by `creative_asset_factory_v3`):

- V2 pipeline (research / script / assets)
- Plan approval
- Video preview
- Subtitle artifact preview
- Music selection summary
- Final approval (approve / regenerate / cancel)
- Publish handoff list

Test IDs: `factory-v3-video`, `factory-v3-subtitle`, `factory-v3-music`, `factory-final-approval-panel`, `factory-v3-publish-handoff`

---

## Recovery / duplicate guard

- Subtitle stage skips if `stageOutputs.subtitle.subtitleArtifact.artifactId` exists
- Music stage skips if `musicSelection.selectionId` exists
- Publish handoff skips if `publishOptions` already populated
- Mission context + blackboard persist both approval statuses for refresh hydration

---

## Tests

### Core unit tests

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/factoryRuntime/
```

| Suite | Coverage |
|-------|----------|
| `creativeFactoryV3Subtitle.test.js` | Timing fallback, SRT generation |
| `creativeFactoryV3Stages.test.js` | Subtitle persist, music, handoff, duplicate skip |
| `creativeFactoryV3Fallback.test.js` | V3 → V2 → V1 flag fallback |
| `factoryApprovalService.test.js` | Regenerate rewinds to execute |
| `factoryRuntimeExecutor.test.js` | V1/V2 regression with `resumedApprovalStageId` |

### Dashboard unit tests

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/runtime/factoryExecutionModel.test.ts
```

### E2E

`tests/e2e/creative-factory-v3.spec.ts` — plan → final approval → publish handoff → refresh

---

## Limitations (V3)

- Subtitle timing is estimated (even split), not word-level or ASR-aligned
- No server-side subtitle burn-in (sidecar only)
- Music selection is catalog/env-bed heuristic, not a full recommendation engine
- Publish handoff is options only — no governed publish execution from factory card
- `optionalArtifacts` on stages not validated post-stage (platform P2)

---

## V4 recommendation

### Can Creative Factory V4 begin?

**YES**

V3 proves the hardened runtime supports extended pipelines, multiple approval checkpoints, and rich artifact authority without executor forks. V4 can focus on production quality and compositing.

### Allowed V4 scope

- Multi-scene rendering and scene-level asset binding
- Optional server-side subtitle burn-in (ffmpeg)
- Stronger publish workflow with governed handoffs (still user-confirmed)

### Still NOT allowed

- Replacing Factory Runtime
- Bypassing Performer Runtime
- Uncontrolled auto-publish

---

## Configuration

```env
ENABLE_CREATIVE_FACTORY_V3=false   # set true to route creative video intents to V3
ENABLE_CREATIVE_FACTORY_V2=false
ENABLE_CREATIVE_FACTORY_V1=true
VIDEO_MUSIC_BED_URL=               # optional music fallback
```

Invoke: intake creative intent (when V3 enabled) or `POST /api/performer/runtime/run-factory` with `factoryId: creative_asset_factory_v3`.
