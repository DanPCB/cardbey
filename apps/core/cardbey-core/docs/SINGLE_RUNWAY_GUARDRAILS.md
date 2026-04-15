# Single Runway Guardrails

Cardbey uses a **Single Runway** architecture:

- **Outcome/Artifact UIs** (Draft Review, slideshow, preview, MI Assistant) are **viewers + requesters**.
- **Mission Execution UI** is the only **executor**.
- All work runs through `IntentRequest` → `run` → `MissionEvent` → `intent.result`.

This prevents drift, duplicate jobs, 403/409 scope issues, and inconsistent UI state.

---

## Summary Rules (non-negotiable)

### Rule 1 — No direct orchestra from artifact pages
When `missionId` is present:

- Outcome/Artifact UIs **MUST** create an `IntentRequest`
- Outcome/Artifact UIs **MUST NOT** call `/api/mi/orchestra/start`
- Execution runs only from **Mission Execution UI**

### Rule 2 — No direct chat scope from artifact pages
When `missionId` is present:

- MI Assistant (and any chat UI that would resolve scope) **MUST NOT** call `/api/chat/resolve-scope`
- It **MUST** queue an `IntentRequest` of type `mi_assistant_message` via
  `submitMIAssistantMessageToMission(...)`
- UI must show: **“Queued in Mission. Open Mission to run.”** and link to `/app/missions/:missionId`

### Rule 3 — MissionId propagation is mandatory
- Any link from **Mission Execution → Artifact UI** must include `missionId`
- Artifact UIs must pass `missionId` down to all components that can trigger actions

Without this, pages fall back to legacy behavior and drift returns.

---

## Allowed/Forbidden (clarifies enforcement)

### Allowed
- **Mission Execution UI** may execute intents by calling:
  `POST /api/mi/missions/:missionId/intents/:intentId/run`
- **Legacy mode** (no `missionId`):
  - Artifact UIs may still call orchestration endpoints (until fully migrated)
  - Chat UIs may call `/api/chat/resolve-scope`

### Forbidden
When `missionId` exists:
- Any artifact UI calling `/api/mi/orchestra/start`
- Any artifact UI calling `startOrchestraTask(...)`
- Any artifact UI calling `/api/chat/resolve-scope`

---

## Enforcement Mechanisms

### Runtime boundary (orchestra)
`apps/dashboard/.../lib/missionRuntime/executeOrchestra.ts` is the only module allowed to call
`startOrchestraTask` / `runOrchestraJob`.

It throws if `missionId` is present and `callerContext !== 'mission_execution'`.

### Helper (orchestra)
`assertNoDirectOrchestraWhenMissionId(missionId)` in `apps/dashboard/.../lib/missionIntent.ts`

Call this before any code path that could invoke orchestra from artifact UI.

### Runtime boundary (chat scope)
`assertNoDirectChatScopeWhenMissionId(missionId)` in the same file.

Call this before any code path that could call `/api/chat/resolve-scope` from artifact UI.

### MI Assistant queue (chat)
`submitMIAssistantMessageToMission({ missionId, message, storeId?, draftId?, generationRunId? })`

Creates an intent type `mi_assistant_message` and returns `intentRequestId`.

---

## Developer Workflow (simple rule)

| If… | Then… |
|-----|--------|
| User clicks a button (artifact/outcome UI) | Create **IntentRequest** (queue in Mission Inbox). |
| Something must run | Execute from Mission Execution only: `POST /run`. |
| Something completes | Emit **MissionEvent**, set intent `result`, return `intent.result`. |
| Something displays | Render **artifacts** (links, preview, feed). |

---

## Code Review / Grep

### Orchestra drift checks
Search for:
- `orchestra/start`
- `startOrchestraTask`
- `assertNoDirectOrchestraWhenMissionId`
- `no direct orchestra from artifact pages`

### Chat drift checks
Search for:
- `resolve-scope`
- `resolveScope`
- `/api/chat/resolve-scope`
- `assertNoDirectChatScopeWhenMissionId`
- `submitMIAssistantMessageToMission`

Any usage of `/api/chat/resolve-scope` in artifact UI when `missionId` exists is a violation.

---

## User-facing message standard

When a guard triggers, the UI must show:

**Queued in Mission. Open Mission to run.**

And provide:
- **Open Mission** → `/app/missions/:missionId`
- optional: “Why?” tooltip (“Single Runway keeps results consistent.”)