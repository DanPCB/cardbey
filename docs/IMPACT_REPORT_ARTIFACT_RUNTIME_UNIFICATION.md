# Impact report: Artifact runtime unification (Phase 1)

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| Website preview iframe | Medium — preview loading moved to stream; iframe stays in inspector | `runtimeUnified` flag; shared `shouldShowWebsitePreviewLoading` |
| AI Activity checklist | Low — hidden in panel when unified; shown as "Execution progress" in stream | Revert with `VITE_PERFORMER_ARTIFACT_RUNTIME_UNIFIED=0` |
| Mission delivered artifacts (video) | Low — moved from separate centre block into timeline | Legacy block kept when flag off |
| Panel open/restore (sessionStorage) | Low — inspector still uses same `focusExecutionArtifacts` / panel state | No persistence schema change |
| SSE / projection | None — read-only merge of `missionProjection.artifacts` | No store changes |
| Approvals / QA cards | None — still in thread via `postBuildInlineUi` | Hidden artifact types unchanged |
| Mobile layout | Low — panel remains full-screen overlay; stream cards are tap targets | `data-runtime-inspector` on panel |
| Route contract tests | None | Dashboard-only UI |

## Why

Performer is the execution owner; artifacts were rendered in three places (panel, centre block, blackboard overlap). Phase 1 centralizes **visibility** in the stream while keeping **heavy inspector UI** (iframe, step JSON, CTAs) in the side panel.

## Impact scope

- `/app` Performer console (`ConsoleCentreColumn`, `ConsoleExecutionPanel`)
- Not changed: `ExecutionDrawer` on `/app/missions/:id`, agent-chat artifact cards, MissionDetailView blackboard

## Smallest safe patch (this PR)

1. Feature flag `VITE_PERFORMER_ARTIFACT_RUNTIME_UNIFIED` (default on; `=0` to reverse).
2. `PerformerArtifactStreamTimeline` after unified blackboard stream.
3. Panel becomes "Inspector"; hides duplicate AI Activity + preview loading when unified.
4. Tests for merge, timeline, flag.

## Phase 3 (Performer-owned artifact actions)

- `dispatchPerformerArtifactAction` + `ArtifactActionStreamProvider`
- Mutation/publish via executor; preview-only actions bypass dispatcher
- Rollback: `VITE_PERFORMER_ARTIFACT_ACTIONS_UNIFIED=0`

## Phase 2B (inline preview in stream)

- `VITE_PERFORMER_INLINE_PREVIEW_IN_STREAM=0` — Phase 1 link card only (unified runtime still on).
- Stream: collapsed shell by default; iframe mounts only when expanded.
- Inspector panel: full iframe only when preview is selected in Inspector or overlay expanded (`Open full`).

## Rollback

```bash
# .env.local or CI
VITE_PERFORMER_ARTIFACT_RUNTIME_UNIFIED=0
# or only disable inline preview / unified actions:
VITE_PERFORMER_INLINE_PREVIEW_IN_STREAM=0
VITE_PERFORMER_ARTIFACT_ACTIONS_UNIFIED=0
```

Restart dashboard dev server.
