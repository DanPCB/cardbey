# Single Runway Guardrails

**No direct orchestra from artifact pages.** When `missionId` is present, artifact/outcome UIs (Draft Review, slideshow, preview, MI Assistant) MUST create an `IntentRequest` and MUST NOT call `/api/mi/orchestra/start`. Execution runs only from Mission Execution UI.

**No direct chat scope from artifact pages.** When `missionId` is present, MI Assistant (and any chat UI that would resolve scope on store/draft) MUST NOT call `/api/chat/resolve-scope`. It MUST queue an IntentRequest (type `mi_assistant_message`) via `submitMIAssistantMessageToMission` and show “Queued in Mission. Open Mission to run.” with a link to `/app/missions/:missionId`.

## Enforcement

- **Runtime boundary:** `apps/dashboard/.../lib/missionRuntime/executeOrchestra.ts` is the only module that may call `startOrchestraTask` / `runOrchestraJob`. It throws if a call is made with a `missionId` and `callerContext` is not `'mission_execution'`. Artifact UIs must call `startOrchestraFromMissionRuntime` / `runOrchestraFromMissionRuntime` with `callerContext: 'artifact'` and pass through `missionId`; the runtime guard then blocks execution when a mission is set.
- **Helper:** `assertNoDirectOrchestraWhenMissionId(missionId)` in `apps/dashboard/.../lib/missionIntent.ts`. Call it before any code path that would invoke orchestra start from an artifact UI; it throws if `missionId` is set.
- **Chat-scope helper:** `assertNoDirectChatScopeWhenMissionId(missionId)` in the same file. Call it before any code path that would call `/api/chat/resolve-scope` from MI Assistant or chat UI; it throws if `missionId` is set.
- **MI Assistant queue:** `submitMIAssistantMessageToMission({ missionId, message, storeId?, draftId?, generationRunId? })` — creates intent type `mi_assistant_message` and returns intentRequestId. UI shows “Queued in Mission” and “Open Mission” → `/app/missions/:missionId`.
- **Canonical dispatcher:** `dispatchMissionIntent({ missionId, intentType, payload })` — queues intent and navigates to Mission so the user can run it from the Control Tower.
- **Orchestra client:** `orchestraClient.ts` documents that outcome UIs must not call `startOrchestraTask` when `missionId` exists.

## Developer Workflow (simple rule)

When building anything:

| If… | Then… |
|-----|--------|
| User clicks a button (from artifact/outcome UI) | Create **IntentRequest** (queue in Mission Inbox). |
| Something must run | **POST** `/api/mi/missions/:missionId/intents/:intentId/run` (Mission Execution only). |
| Something completes | Emit **MissionEvent**; set intent `result`; return `intent.result`. |
| Something displays | Render **artifacts** (links, preview, feed). |

Outcome UIs do not run; they create intents. Only Mission Execution runs intents and emits events.

## Grep / code review

Search for: `orchestra/start`, `startOrchestraTask`, `no direct orchestra from artifact pages`, `assertNoDirectOrchestraWhenMissionId` to verify no new artifact code calls orchestra start when missionId is present.

Search for: `resolve-scope`, `resolveScope`, `/api/chat` and ensure callers use `assertNoDirectChatScopeWhenMissionId(missionId)` and, when missionId is set, `submitMIAssistantMessageToMission` instead of resolve-scope.
