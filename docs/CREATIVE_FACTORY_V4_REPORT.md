# Creative Factory V4 Report

**Date:** 2026-06-12  
**Factory ID:** `creative_asset_factory_v4`  
**Flag:** `ENABLE_CREATIVE_FACTORY_V4=false` (default)  
**Fallback:** V4 → V3 → V2 → V1

---

## Objective

Upgrade Creative Factory into a **multi-scene production workflow** with optional subtitle burn-in, music mixing, final approval, and **governed publish** — all inside the hardened Factory Runtime.

---

## V4 architecture

```
research → script → asset_search → scene_binding → video_plan
  → plan_approval
  → multi_scene_render (per-scene clips + concat)
  → subtitle_burn_optional (sidecar + optional burn-in variant)
  → music_selection (metadata + optional mux variant)
  → final_asset_review
  → publish_handoff (governed options)
  → artifact_finalize
```

| Layer | Path |
|-------|------|
| Definition | `factories/creativeAssetFactoryV4.js` |
| Scene binding | `creativeFactoryV4SceneBinding.js` |
| Multi-scene render | `creativeFactoryV4MultiSceneRender.js` |
| Post-render stages | `creativeFactoryV4Stages.js` |
| Video concat | `lib/video/concatVideoClips.js` |
| Subtitle burn | `lib/video/burnSubtitlesIntoVideo.js` |
| Bootstrap | `factoryBootstrap.js` (V4 handlers + intent fallback) |

**No executor factory-specific branches.** V4 added via definition + handler registry + bootstrap.

---

## Scene binding model

Each `sceneBindings[]` entry includes:

| Field | Source |
|-------|--------|
| `sceneId` | Plan/script scene id |
| `purpose` | Scene shot / purpose |
| `voiceover` | Split from voiceoverCopy / plan script |
| `onScreenText` | Script or scene text |
| `visualPrompt` | Tone + angle + shot + asset hint |
| `selectedAssetRefs` | Rotated from asset candidates |
| `durationTarget` | Scene durationSec |
| `transitionHint` | Default `cut` |

**Fallback:** No assets → prompt-only binding (single scene if plan empty).

---

## Render strategy

1. **Per-scene clip:** `generateVideoViaKling` via injectable `renderSceneClip` (testable)
2. **Persist:** Each clip → `generated_scene_clip` artifact
3. **Concat:** `concatVideoClips` (ffmpeg concat demuxer) when ≥2 local paths
4. **Final video:** `generated_video` with `sceneClipRefs` in payload
5. **Failure recovery:** If concat fails → `renderStatus: concat_failed_recoverable`, scene clips preserved, factory continues with warning

**Timeout:** `multi_scene_render` stage `timeoutMs: 600_000` (10 min cap per factory stage).

---

## Artifact model

| `artifactType` | Stage |
|----------------|-------|
| `generated_scene_clip` | multi_scene_render |
| `generated_video` | multi_scene_render (concat output) |
| `generated_subtitle` | subtitle_burn_optional |
| `generated_video_variant` | subtitle burn-in / music mux |
| `generated_music_selection` | music_selection |
| `final_creative_asset` | artifact_finalize |

Original video is **never overwritten** — variants are separate artifacts.

---

## Second approval + governed publish

| Checkpoint | Status | Actions |
|------------|--------|---------|
| Plan | `awaiting_factory_approval` | Approve / Cancel / Regenerate plan |
| Final asset | `awaiting_final_asset_approval` | Approve / Regenerate render / Regenerate scene / Cancel |

**Governed publish** (`POST /api/performer/runtime/factory-publish`):

- Requires final approval (403 if not approved)
- User selects target from `publishOptions`
- Records `FACTORY_PUBLISH_REQUESTED` via MissionBlackboard
- Routes through `RUNTIME_AUTHORITY_PATH_USED`
- Returns `pending_user_confirmation` — **no auto-publish**

---

## Recovery strategy

| Level | Decision | Behavior |
|-------|----------|----------|
| Final render | `regenerate` | Clear from `multi_scene_render` downstream, rewind to render stage |
| Single scene | `regenerate_scene` + `sceneId` | Remove scene clip, re-run render (other clips preserved) |
| Whole plan | `regenerate_plan` | Rewind to plan approval (keeps research/script unless cleared) |

Research/script **not** re-run on render regeneration.

---

## Dashboard UI

`FactoryConsoleCard` V4 panels:

- Scene list (`factory-v4-scenes`) — expandable
- Scene clip status (`factory-v4-scene-clips`)
- Video / subtitle / music (shared V3 components)
- Subtitle burn + music variant status lines
- Final approval panel
- Governed publish handoff

---

## Tests

### Core

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/factoryRuntime/
```

| Suite | Coverage |
|-------|----------|
| `creativeFactoryV4SceneBinding.test.js` | Binding + asset fallback |
| `creativeFactoryV4MultiSceneRender.test.js` | Clip persist + concat failure recovery |
| `creativeFactoryV4Stages.test.js` | Subtitle burn fallback + governed publish gate |
| `creativeFactoryV4Fallback.test.js` | V4 → V3 flag fallback |
| `factoryApprovalService.test.js` | Regenerate → multi_scene_render |

### Dashboard

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/runtime/factoryExecutionModel.test.ts
```

### E2E

`tests/e2e/creative-factory-v4.spec.ts`

---

## Limitations

- Scene timing/subtitle alignment still estimated (not word-level)
- Concat requires local clip paths (remote-only clips skip concat)
- Music mux requires local video + music paths; fails softly with `muxWarning`
- Governed publish records intent only — actual store/signage publish requires separate confirmed UI flow
- Kling per-scene render is sequential (no render queue worker yet)

---

## V5 recommendation

### Can Creative Factory V5 begin?

**YES**

V4 proves multi-scene orchestration, variant artifacts, and governed publish hooks on the reusable runtime. V5 can harden production operations without replacing Factory Runtime.

### Allowed V5 scope

- Render queue hardening (deferred jobs, progress SSE)
- Provider comparison / fallback routing
- Campaign integration from publish handoff
- Template-driven creative variants

### Still NOT allowed

- Replacing Factory Runtime
- Bypassing Performer Runtime
- Uncontrolled auto-publish

---

## Configuration

```env
ENABLE_CREATIVE_FACTORY_V4=false
ENABLE_CREATIVE_FACTORY_V3=false
ENABLE_CREATIVE_FACTORY_V2=false
ENABLE_CREATIVE_FACTORY_V1=true
VIDEO_MUSIC_BED_URL=
```
