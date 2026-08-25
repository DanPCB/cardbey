# IMPACT REPORT — Multi-Agent Capability E2E (7-phase)

Date: 2026-08-25  
Branch target: `fix/multi-agent-capability-e2e` (from current canonical HEAD)  
Status: **Phase 1 starting** after honest map vs master-prompt assumptions

---

## Flow map (actual)

```
User prompt
  → POST /api/performer/intake[/v2]  (V1 shims into V2 — one handler)
  → optional body.missionType = multi_agent | campaign_orchestration
  → else IntentReasoner / classifier
  → create_campaign often chosen for campaign NL  ← gap (legacy checkpoint)
  → OR unifiedDispatch(multi_agent|campaign_orchestration)
  → missionPipelineRunner → AgentCoordinator.orchestrate()
  → MissionBlackboard events + campaign package persist
  → MultiAgentMissionCard (polls blackboard / CampaignPackageCard)
  → verify/learn: MISSING in runner
```

`decideTurn.js`: **already absent** (orphan docs only).  
`POST /api/performer/turn`: reason-only — does not run AgentCoordinator.  
`BusinessContextService`: **does not exist** — closest is `businessOperationIntelligence`.  
Agents: PHASE_B **stubs**. SKP wired on turn path, not coordinator.

---

## (1) What could break

| Risk | Severity |
|------|----------|
| NL campaign phrases suddenly open multi-agent confirm instead of create_campaign checkpoint | High UX |
| Over-broad orchestration regex steals simple “create campaign” flows | Medium |
| Dual concurrent POSTs still create two missions (no server idempotency key) | Medium |
| Later phases assume `run()` / `emitArtifact` / live agents — wrong APIs | High if copied blindly |
| Learn step writing Business / Seed / User | Forbidden — must use BOI only |

## (2) Why

Master prompt assumed symbols and dual mounts that no longer match the repo. Real gap for Phase 1: **campaign NL → `create_campaign` instead of `campaign_orchestration`**.

## (3) Impact scope

- `lib/intent/campaignOrchestrationIntent.js` (+ resolve helper)
- `routes/performerIntakeV2Routes.js` early fast-path + create_campaign redirect
- Unit tests only for Phase 1 (no live concurrent HTTP gate without local server)

## (4) Smallest safe Phase 1 patch

1. Add `resolveIntakeOrchestrationDispatch({ missionType, userMessage })`.
2. Call it immediately after / instead of only raw `body.missionType` check.
3. When classification is `create_campaign` **and** orchestration phrase matches, dispatch `campaign_orchestration` (still confirmation-gated).
4. Do **not** invent `decideTurn` removal (already gone). Do **not** change `AgentCoordinator.orchestrate` signature.
5. Document remaining gaps for Phases 2–7 against real APIs.

---

## Phase gate reframes

| Phase | Master assumption | Repo reality / gate |
|-------|-------------------|---------------------|
| 1 | Remove decideTurn dual mount | Fast-path NL → orchestration; single V2 path documented |
| 2 | `run()` + buildSKP | Wire SKP into `orchestrate()` / baseContext |
| 3 | analytics_reporting / smart_visual bugs | Map to `get_store_analytics` / `generate_report_summary` / `smart_visual.js` |
| 4 | graphicUrl on MultiAgentMissionCard | Wire CampaignPackageCard + artifact fields |
| 5–7 | As specified, adapted to llmGateway + BOI | Same intent |
