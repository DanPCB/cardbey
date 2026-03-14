# Impact Report: MI Assistant as Universal Mission Continuation Layer

## Risk assessment (before changes)

### Could making MI Assistant the universal mission shortcut break anything?

| Area | Risk | Mitigation |
|------|------|------------|
| **Page-specific quick actions** | Low | Keep current quick actions (suggestions, Agent Mode, Job tab). Subordinate them to the mission model: when an active mission exists, show mission summary + Continue first; quick actions remain below or in same panel. No removal of existing actions. |
| **Mission Console routing** | Low | MI Assistant does not replace Mission Console. It adds a "Continue mission" / "Open Mission Console" CTA that **navigates** to `/app/missions/:missionId`. All execution stays in Console (ConsoleContext, ExecutionDrawer, missionStore). No second execution pipeline. |
| **Store review flows** | Low | Store review already passes `missionId` in URL and uses it for queueMIAssistantIntent / showQueuedInMissionToast. We only **read** missionId and optionally mission state to show summary; we do not change how store review starts or queues intents. |
| **Publish / store creation / auth** | None | No changes to publish pipeline, store creation flow, or auth/session logic. |

**Conclusion:** Safe to proceed with a minimal, additive change: (1) extend MI Shell context with route/page/missionId/draftId; (2) detect "active mission" from URL or mission store; (3) show mission summary + resume CTA when active mission exists; (4) deep-link to Mission Console only (no execution in MI Assistant).

---

## Proposed MI Assistant state model

### Two modes

| Mode | Condition | UI |
|------|-----------|-----|
| **A. No active mission** | No `missionId` in context or mission not in store / terminal | Prompt input; page-relevant quick actions; option to start new mission in current context. |
| **B. Active mission exists** | `missionId` in context and `getMission(missionId)` returns a non-terminal mission | Mission summary (title, status, progress, next action); primary CTA "Continue mission" / "Open mission"; link "Open Mission Console" (deep-link to `/app/missions/:missionId`). |

### Context (carried into MI Assistant)

- **route / page**: pathname (e.g. `/app/store/temp/review`)
- **pageMode**: derived — `review` | `preview` | `public` | `console` (from path)
- **storeId**: from route params or search params
- **draftId**: from search params or context
- **missionId**: from URL search (`?missionId=`) or route (`/app/missions/:missionId`) or fallback "recent active" from mission store

### Active mission detection

1. **From URL (priority):** `searchParams.get('missionId')` (e.g. on store review) or route param `missionId` when path matches `/app/missions/:missionId`.
2. **From mission store (fallback when not on a mission URL):** `listMissions()` sorted by `updatedAt` desc; first mission with `status` not in `['completed', 'cancelled']` is treated as "current" for resume. Optional; can be limited to "when on console-related routes" if desired.

### Mission continuation routing

- **Continue mission / Open mission:** `navigate(/app/missions/${missionId})`. Same Mission Console and execution pipeline; no duplicate logic.
- **Open Mission Console (home):** `navigate('/app')`.

---

## What we do not change

- Publish pipeline, store creation flow, mission execution engine (unless required for detection/display only), auth/session logic.
- Mission Console routing or ExecutionDrawer behavior.
- Store review intent queue (queueMIAssistantIntent, showQueuedInMissionToast).

---

## Changed files (planned)

| File | Change |
|------|--------|
| `apps/dashboard/.../components/mi-shell/miShell.store.ts` | Extend `MiShellContext` with `draftId`, `pageMode` (optional). |
| `apps/dashboard/.../components/mi-shell/MiShell.tsx` | Sync context from `useLocation()`: pathname, search (missionId, storeId, draftId), derive pageMode; set missionId from URL or recent-active; DEV logs. |
| `apps/dashboard/.../components/mi-shell/MiPanel.tsx` | When `context.missionId` and `getMission(missionId)` exists and not terminal: render mission summary block (title, status, progress, next action) + "Continue mission" (navigate) + "Open Mission Console"; DEV logs. When no active mission: keep existing Suggestions/Agent/Job tabs and content. |
| `docs/IMPACT_REPORT_MI_ASSISTANT_UNIVERSAL_MISSION_LAYER.md` | This report. |

---

## Manual verification steps

1. **No active mission:** Open a page without `missionId` in URL and with no in-progress mission in store. Open MI Assistant → see prompt + quick actions; no mission block.
2. **Active mission from URL:** Open store review with `?missionId=xyz`. Open MI Assistant → see "active mission detected: xyz"; mission summary and "Continue mission" → navigates to `/app/missions/xyz`.
3. **Resume route:** Click "Continue mission" or "Open Mission Console" → URL is `/app/missions/:id` or `/app`; execution remains in Mission Console only.
4. **DEV logs:** In console: `[MI Assistant] active mission detected: <id or none>`, `[MI Assistant] current context: ...`, `[MI Assistant] resume route: ...`.
5. **Store review unchanged:** Store review flow (Improve, queue intent, toast) still works; no change to publish or store creation.

---

## Return (summary)

- **Proposed MI Assistant state model:** See "Proposed MI Assistant state model" above (two modes A/B, context fields, detection, continuation routing).
- **Changed files:** `miShell.store.ts` (context already has draftId, pageMode); `MiShell.tsx` (new: sync URL → context + DEV logs); `MiPanel.tsx` (mission summary block, CTAs, pass context to MIHelperPanel, DEV logs); `miCommands.ts` (openMI sets shell context from input.context); `missionStore.ts` (add `isMissionTerminal`, `getActiveMissionIdFromStore`).
- **How active mission is detected:** (1) From URL: `searchParams.get('missionId')` or route param on `/app/missions/:missionId`. (2) Fallback: `getActiveMissionIdFromStore()` (first non-terminal mission by updatedAt). Active = mission exists and `!isMissionTerminal(getMission(missionId))`.
- **How mission continuation is routed:** "Continue mission" / "Open mission" → `navigate(/app/missions/${missionId})`. "Open Mission Console" → `navigate('/app')`. No execution in MI Assistant; same pipeline as Mission Console.
- **Manual verification steps:** Listed above (1–5).
