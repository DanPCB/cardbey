# Performer Mission Execution Regression — Audit

**Date:** 2026-06-16  
**Scope:** Promo video + campaign missions regressing to `general_chat` after proactive step actions.

## Executive summary

Missions start correctly for intents like “Create a short promotional video for my store” and “Launch a marketing campaign”, but **proactive step execution can re-enter Intake V2 as plain chat** (`general_chat` / `action: 'chat'`). The mission card may still show “running” while the thread behaves like generic assistant chat.

**Primary root cause:** `runProactivePlanStepInternal` falls through to `onMissionTrigger` for tools **not** on the dashboard’s hardcoded proactive runway list (e.g. `create_video`). `onMissionTrigger` submits a **new** `IncomingPerformerIntent` through `submitPerformerIntent` **without** `executeProactiveStepFromIntent`, so Intake V2 classifies the step text as chat.

**Secondary causes:** Agent loop short-circuit (`PERFORMER_CHAT_AGENT_LOOP`), `resolveProactiveStepTool()` fallback to `general_chat`, fallback chip path without structured extras, and no server-side guard when `activeMissionId` + running mission + `general_chat`.

---

## 1. Mission context persistence

| Field | Where stored | Notes |
|-------|--------------|-------|
| `missionId` | `activeMissionIdRef`, `activeMission.missionId`, intake `body.missionId` | Synced on plan start; can clear on `emptyThreadForThisTrigger` or stale campaign detach |
| `activeMissionId` | `useIntakeV2.activeMissionIdRef`, `postIntakeV2` → `currentContext.activeMissionId` | Cleared on `freshStoreMission`, new session, `handleNewMission` |
| `runwayContext` | Proactive plan state refs (`proactivePlanStateRef`, `proactivePlanTotalRef`) | Plan steps + parameters; may be empty if fallback path runs |
| Selected capability | Intake classification / runtime session hydration | Not re-applied on step re-entry |
| Current step | `proactiveRunningStep`, execution panel workspace | UI-only until step executor runs |
| `storeId` | `effectiveStoreId`, `runtimeSessionStoreId`, intake context | Required for video/campaign tools |
| `conversationSessionId` | `useConversationStore`, intake POST | Persists across turns; classifier does not force mission resume |

**Gap:** Intake loads `existingMission` but **does not block** `general_chat` when mission status is active.

---

## 2. Performer input routing

### “Create a short promotional video for my store”

1. Composer → `buildTypedComposerIntent` → `handleSendGuarded` → `trigger`
2. Intake V2 → `create_video` / `proactive_plan` / campaign orchestration
3. Mission + proactive plan card; `activeMissionIdRef` set

### “Launch a marketing campaign”

1. Same door; may hit `campaign_orchestration` dispatch or proactive plan
2. Runtime orchestrator path when flags enabled

### “Run proactive step 1” (intended path)

1. `submitProactiveStepViaIntent` → `buildProactivePlanStepIntent` + `executeProactiveStepFromIntent`
2. `trigger` checks extras **first** → `runProactivePlanStepInternal`
3. **Should not** reach Intake V2

### “Run proactive step 1” (regression path)

1. Step tool not on dashboard runway list (e.g. `create_video`) → runtime path skipped
2. `onMissionTrigger(missionInput)` → **new** intent without step extras
3. Intake V2 → classifier → `general_chat` / agent loop direct chat

### “general chat” / unrelated text during active mission

1. Typed composer → Intake V2 → `general_chat` (no disambiguation today)

---

## 3. Fallback condition (`intent = general_chat`)

| Location | Condition |
|----------|-----------|
| `intakeClassifier.js` | Low confidence, meta phrases, “Run proactive step …” treated as chat |
| `performerIntakeV2Routes.js` ~2730 | Agent loop `direct_chat` before classifier |
| `resolveProactiveStepTool()` | Missing / non-allowlisted `recommendedTool` → `general_chat` |
| `usePerformerConsole` `trigger` | Intake V2 main path when no `executeProactiveStepFromIntent` |
| `onMissionTrigger` | Re-submits step goal as new intent → full intake |

Observed user message (“typed chat by mistake…”) is **not** in repo catalog; consistent with **LLM agent loop** paraphrase, not `defaultChatUnclear`.

---

## 4. Active mission guard (implemented)

**Rule:** When `activeMissionId` exists and status ∈ `{ running, executing, queued, in_progress, awaiting_checkpoint, awaiting_confirmation, awaiting_input, paused }`:

- Proactive step commands → `resume_active_mission` (not `general_chat`)
- “continue” / resume phrases → `resume_active_mission`
- Unrelated text → clarify: apply to current mission vs start new (not silent `general_chat`)
- Agent loop skipped for proactive step commands on active missions

**Files:** `activeMissionIntakeGuard.js`, `performerIntakeV2Routes.js`, `activeMissionRouting.ts`, `usePerformerConsole.ts`

---

## 5. Proactive step execution

**Correct path:** UI → `submitProactiveStepViaIntent` → `executeProactiveStepFromIntent` → `runProactivePlanStepInternal` → runtime kernel / proactive-step API.

**Fix:** Runtime step execution for **any non–`general_chat` tool** when `runtimeStepExecution` + `activeMissionId` (not only hardcoded runway list). Prevents `onMissionTrigger` re-entry.

**Structured payload:** `{ actionType: 'mission_step_action', missionId, stepId, command }` added to proactive step intents and intake POST.

---

## 6. UI action buttons audit

| Button | Current behavior | Expected |
|--------|------------------|----------|
| Run next step | `handleFollowUpChip` → `submitProactiveStepViaIntent` ✓ | Structured + extras ✓ |
| Run all remaining steps | `submitProactivePlanAllViaIntent` ✓ | Structured + extras ✓ |
| Add special requirements | Composer prefill | Chat OK (user input) |
| Complete step | Checkpoint flow | Not proactive step |
| Retry (execution panel) | `executeProactiveStepFromIntent` ✓ | ✓ |
| Fallback “advance mission” | `buildThreadFollowUpChipIntent` **without extras** ✗ | Guard + disambiguation |
| `handleChipClick` | Raw `chipToIntent` ✗ | Should use follow-up router for mission chips |

---

## 7. Regression tests (added)

- **A:** Promo video proactive step → route ≠ `general_chat`
- **B:** Campaign proactive step → `activeMissionId` preserved in guard output
- **C:** “continue” during active mission → `resume_active_mission`
- **D:** Unrelated text during active mission → disambiguation clarify, not `general_chat`

---

## 8. Success criteria checklist

| Criterion | Status |
|-----------|--------|
| Video mission does not fall into general chat | Fixed (runtime path + guard) |
| Campaign mission does not fall into general chat | Fixed (guard + existing runway) |
| Mission context persists across UI actions | Improved (structured payload + guard) |
| Proactive buttons call runtime actions | Existing path preserved; payload added |
| `activeMissionId` guards routing | Implemented |
| No fake completion | Existing runtime rejection for `general_chat` steps |
| Explicit failure if mission cannot continue | Unchanged; guard adds clarify |

---

## Impact scope (development safety)

**What could break:** Intake routing for messages during active missions (unrelated text now clarifies instead of free chat). Agent loop skipped for proactive commands on active missions.

**Smallest safe patch:** (1) broaden runtime step eligibility, (2) intake guard module, (3) structured step payload, (4) tests — no change to governance / confirmation flows.
