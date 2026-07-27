# Chat resolve-scope endpoint

## Overview

**POST /api/chat/resolve-scope** resolves chat scope for floating vs full chat. It is additive only: reuses `ConversationThread`, `canAccessThread`, `canAccessMission`, and `canAccessStore`. No new storage tables; optional columns `kind` and `scopeKey` were added to `ConversationThread` for find-or-create.

## Body

```json
{
  "threadId": "optional-cuid",
  "missionId": "optional-mission-id",
  "storeId": "optional-store-id"
}
```

Priority: **threadId** > **missionId** > **storeId** > user default.

## Response (200)

```json
{
  "ok": true,
  "threadId": "...",
  "missionId": "..." | null,
  "scope": "thread" | "mission" | "store" | "user_default",
  "scopeLabel": "Working on: Store My Store" | "Working on: Mission <id>" | "General" | thread title
}
```

## Rules

1. **threadId** — Load thread, enforce `canAccessThread(threadId, user)`. Return thread’s `missionId` and a scope label (title or "Working on: Mission …" or "Thread").
2. **missionId** — Enforce `canAccessMission(missionId, user)`. Find a thread with `thread.missionId === missionId`; if none, create a `ConversationThread` with `kind: "mission_bound"` and add participants (user owner + planner, research). Return `scope: "mission"`, `scopeLabel: "Working on: Mission <id>"`.
3. **storeId** — Enforce `canAccessStore(storeId, user)`. Find or create one thread per store with `scopeKey: "store:<storeId>"` and `kind: "store_default"`. `missionId` may be null. `scopeLabel`: "Working on: Store &lt;storeName&gt;".
4. **Else** — Find or create user default thread with `kind: "user_default"`, `scopeKey: "user:<userId>"`. Return `scope: "user_default"`, `scopeLabel: "General"`.

## Migration

Run before using resolve-scope:

```bash
cd apps/core/cardbey-core
npx prisma migrate deploy
# or for dev
npx prisma migrate dev --name add_conversation_thread_kind_scope
npx prisma generate
```

## Manual test

1. **Auth**  
   Obtain a valid JWT (e.g. login or dev token).

2. **By threadId**  
   - Create or get a thread (e.g. POST /api/threads).  
   - `POST /api/chat/resolve-scope` with `{ "threadId": "<id>" }`.  
   - Expect 200, `scope: "thread"`, same `threadId` and thread’s `missionId`/title.

3. **By missionId**  
   - Use a mission id the user can access.  
   - `POST /api/chat/resolve-scope` with `{ "missionId": "<id>" }`.  
   - First call: 200, new thread, `scope: "mission"`, `scopeLabel: "Working on: Mission <id>"`.  
   - Second call: 200, same thread (find by `missionId`).

4. **By storeId**  
   - Use a store id the user owns.  
   - `POST /api/chat/resolve-scope` with `{ "storeId": "<id>" }`.  
   - First call: 200, new thread, `scope: "store"`, `scopeLabel: "Working on: Store <name>".  
   - Second call: 200, same thread (find by `kind` + `scopeKey`).

5. **User default**  
   - `POST /api/chat/resolve-scope` with `{}` or no body.  
   - First call: 200, new thread, `scope: "user_default"`, `scopeLabel: "General"`.  
   - Second call: 200, same thread.

6. **Forbidden**  
   - `threadId` for a thread the user is not a participant in → 403.  
   - `missionId` the user cannot access → 403.  
   - `storeId` the user does not own → 403.

7. **Unauthenticated**  
   - No auth header → 401.
