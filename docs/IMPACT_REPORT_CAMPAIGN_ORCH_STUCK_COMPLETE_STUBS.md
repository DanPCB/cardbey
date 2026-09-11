# Impact Report: Campaign orchestration “Complete” with stubs / stuck UI

**Date:** 2026-09-11  
**Status:** Implement smallest safe patch (UI honesty + live campaign specialists via existing tools)

## Symptom

After store select + confirm, Multi-agent mission shows **Complete**, plan pills green, but:

- Event rows still spin on `agent_assigned` (Brief / Graphics)
- Package card: “No visual assets generated”
- Chat still shows “Review… confirm to start” (stale intake message)
- Agent summaries are PHASE_B stubs (`Brief stub…`)

## Root cause (code-traced)

1. **Campaign specialists are still stubs** — `briefAgent` / `graphicsAgent` / `copyAgent` / `packageAgent` / `slideshowAgent` only override `buildResult()`; they never call LLM or campaign tools. Research/Build/QA/Action were live-wired earlier; campaign wave types were not.
2. **Package is a stub shell** — `findCampaignPackageInResults` takes package agent `result`, which has no `assets.poster` / platform copy → CampaignPackageCard shows empty visuals.
3. **UI treats every `agent_assigned` as active spinner** — completed missions still list assign events with spinning icons; pills correctly go green via `agent_completed`, but the feed looks stuck.
4. **Confirm path itself is not the stall** — pipeline reaches `completed`; chat copy is leftover intake text, not a live confirm gate.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Offline / no media API → blocked tools | `generate_campaign_graphics` needs VideoSearch | Keep stub fallback on tool failure; do not mark false “live” success |
| QAAgent campaign path conflicts with build QA | Shared `qa` agent type | Campaign path only when `build` prior missing and brief/graphics/copy present |
| Ownership / runtime authority blocks | `dispatchTool` guards | Same pattern as ActionAgent: `runtimeAuthority: true`, mission/store context |
| UI hides active spinners too early | Filtering assign events | Only suppress spinner when same task/agent has `agent_completed` or mission `done` |
| Existing stub unit expectations | Agents change execute() | Preserve `buildResult` stubs; add mocked dispatch tests |

## Impact scope

- Core: `briefAgent`, `graphicsAgent`, `copyAgent`, `packageAgent`, optional QA campaign branch in `qaAgent`
- Helper: small `campaignAgentLive.js` (dispatch + package UI shape) — no coordinator signature change
- Dashboard: `MultiAgentMissionCard` event spinner honesty
- Does **not** change intake routing, confirm governance, matching, Launchpad, or auto-publish

## Smallest safe patch

1. Override `execute()` on campaign specialists to call existing tools (`create_campaign_brief`, `generate_campaign_graphics`, `generate_campaign_copy`, `package_campaign_artifact`) via `dispatchTool`; stub fallback on failure.
2. Package agent maps tool outputs into `CampaignPackage` UI shape (`assets.poster`, `copy`, `qaReview`).
3. MultiAgentMissionCard: assigned rows show check (not spinner) when completed for that agent/task or mission is done.

## Explicitly not doing

- Silent publish / bypass confirm
- Rebuilding AgentCoordinator
- Requiring Claude for brief/copy (tools are already deterministic/content-tool based)
