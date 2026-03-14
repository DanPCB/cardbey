# MI Assistant — Single Runway Integration

When **missionId** is present (e.g. user opened a draft/store from Mission), MI Assistant must **not** call `POST /api/chat/resolve-scope` (that path can 403 on store/draft context). It must queue an IntentRequest and let Mission Execution run.

## Implemented

- **Frontend** (`apps/dashboard/.../lib/missionIntent.ts`):
  - `assertNoDirectChatScopeWhenMissionId(missionId)` — call before any path that would call resolve-scope; throws if missionId is set.
  - `submitMIAssistantMessageToMission({ missionId, message, storeId?, draftId?, generationRunId? })` — creates intent type `mi_assistant_message`, returns intentRequestId.
  - `getIntentLabel('mi_assistant_message')` → "MI Assistant message".
- **Backend** (`apps/core/cardbey-core/src/routes/miIntentsRoutes.js`):
  - `POST .../intents` accepts `type: 'mi_assistant_message'`.
  - `POST .../intents/:intentId/run`: when `intentType === 'mi_assistant_message'`, marks intent completed with `result: { message, storeId?, draftId? }` (no resolve-scope, no store mutation).
- **Docs:** `docs/SINGLE_RUNWAY_GUARDRAILS.md` updated with chat-scope rule and grep hints.

## Wiring the MI Assistant UI

The component that opens the "MI Assistant" / "Agent Mode" panel and calls `/api/chat/resolve-scope` was **not** found in `apps/dashboard` (search: `resolve-scope`, `resolveScope`, `/api/chat`). It may live in another app or be provided by the IDE.

When you locate or add that UI:

1. **Read mission context**  
   - `missionId`: from URL query (e.g. `searchParams.get('missionId')`) or route/context.  
   - Optional: `storeId`, `draftId`, `generationRunId` from page state or URL.

2. **Before calling resolve-scope**  
   - Call `assertNoDirectChatScopeWhenMissionId(missionId)`.  
   - If missionId is present, do **not** call resolve-scope.

3. **When missionId is present**  
   - On send, call:
     ```ts
     const intentId = await submitMIAssistantMessageToMission({
       missionId,
       message: userMessage,
       storeId,
       draftId,
       generationRunId,
     });
     ```
   - Show: **"Queued in Mission. Open Mission to run."**  
   - Button: **"Open Mission"** → `/app/missions/${missionId}`.

4. **When missionId is absent**  
   - Keep current behavior (call `/api/chat/resolve-scope` as today).

## Verification

- With **missionId** (e.g. draft page opened from Mission): no request to `/api/chat/resolve-scope`; intent appears in mission inbox; "Open Mission" works.
- **Without missionId**: existing chat/resolve-scope behavior unchanged.
