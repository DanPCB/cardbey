# Impact Report: Agent Messages (Communication Layer)

**Date:** 2026-02-26  
**Scope:** Prisma `AgentMessage` model, migration `20260226100000_add_agent_message`, Express routes `POST/GET /api/agent-messages`, and server wiring.

---

## 1. Summary

The new implementation is **additive and low-risk** for existing behavior. It does not modify existing tables (other than adding a new table and an optional FK from `AgentMessage.taskId` → `OrchestratorTask.id`). No existing routes or OrchestratorTask usages were changed. One **data isolation** risk was identified on GET (see below); the rest are optional hardening and operational suggestions.

---

## 2. What Could Break / Be Affected

### 2.1 Database & Schema

| Area | Risk | Status |
|------|------|--------|
| **Existing tables** | New migration only adds `AgentMessage` and optional `AgentMessage.taskId` FK. No columns removed or renamed on `OrchestratorTask` or any other model. | ✅ No impact |
| **OrchestratorTask usage** | All current code uses `findUnique` / `findMany` / `create` / `update` without `include: { messages: true }`. Adding the relation does not change query results or response shapes. | ✅ No impact |
| **Migration order** | Migration was applied after existing ones. No dependency on future migrations. | ✅ No impact |
| **SQLite** | Schema and migration are SQLite-compatible (TEXT, INTEGER for boolean, FK supported). | ✅ No impact |

**Verdict:** No expected breakage or instability from schema/migration.

---

### 2.2 Routing & Middleware

| Area | Risk | Status |
|------|------|--------|
| **Route path** | Routes are `POST /api/agent-messages` and `GET /api/agent-messages`. No other route in the codebase uses `/agent-messages`. | ✅ No conflict |
| **Mount order** | Router is mounted with `app.use('/api', agentMessagesRoutes)`. Same pattern as other `/api` routers (e.g. billing, seedLibrary). Exact path `/api/agent-messages` is matched by this router. | ✅ No conflict |
| **Auth** | Both handlers use `requireAuth`. Behavior matches rest of app (JWT + dev token); guest tokens get `req.user.id` set. | ✅ Consistent |
| **Error handling** | Handlers use `next(err)`; global `errorHandler` will catch and return JSON. Prisma errors (e.g. P2002, P2025) are already handled. | ✅ No impact |

**Verdict:** No expected breakage or instability from routing or auth.

---

### 2.3 Data Isolation (Authorization) — Risk

| Area | Risk | Status |
|------|------|--------|
| **GET /api/agent-messages** | Any authenticated user can pass any `missionId` and receive all messages for that mission that satisfy `visibleToUser = true OR senderType = 'user'`. If `missionId` is used as `OrchestratorTask.id`, then User A could read messages for User B’s task. | ⚠️ **Data isolation gap** |

**Impact:** Possible cross-user visibility of messages when `missionId` refers to another user’s mission/task.

**Verdict:** No change to “current system structure,” but a **real risk** for multi-tenant isolation once messages are used for real missions.

---

### 2.4 Dependencies & Conventions

| Area | Risk | Status |
|------|------|--------|
| **Prisma client** | Router uses `getPrismaClient()` like other routes (e.g. seedLibrary). Single shared client. | ✅ Consistent |
| **req.user.id** | POST uses `req.user.id` for `senderId`. `requireAuth` sets `req.user` (and `req.userId`) for both DB users and guest tokens. | ✅ Correct |
| **Body/query validation** | Required fields validated (missionId, text for POST; missionId for GET); 400 returned with clear codes. | ✅ Reduces bad data risk |

**Verdict:** Aligned with existing patterns; no new instability.

---

## 3. Suggestions to Prevent Damage and Harden

### 3.1 High priority: Scope GET by mission ownership (prevent data leak)

- **Suggestion:** When `missionId` corresponds to an `OrchestratorTask`, restrict GET to tasks where `userId = req.user.id` (or same tenant, if you enforce tenantId). For “generic” mission IDs not backed by a task, either:
  - Require that only the creating user can list messages (e.g. maintain a separate “mission owner” or allow list), or
  - Document that `missionId` is treated as user-scoped and add a later ownership layer.
- **Implementation sketch:** In GET handler, (1) optionally resolve `missionId` to `OrchestratorTask` by id; (2) if a task exists, allow list only if `task.userId === req.user.id` (or your tenant rule); (3) if no task, either allow (current behavior) or restrict to messages where `senderId === req.user.id` for that mission.
- **Minimal safe patch:** Add a check: only return messages for `missionId` when there is an `OrchestratorTask` with `id = missionId` and `userId = req.user.id`; otherwise return 403 or empty list. This keeps “generic” mission IDs unchanged until you define ownership.

### 3.2 Medium priority: Operational and safety

- **Rate limiting:** Add a rate limit for `POST /api/agent-messages` (and optionally GET) per user to avoid abuse and accidental flooding (e.g. reuse existing pattern from `orchestraStartLimiter` / auth verification).
- **Payload size:** Rely on existing body size limits; consider a max length for `text` (e.g. 32 KB) to avoid huge JSON and storage.
- **Guest users:** If guest tokens can call this API, they will create messages with `senderId = guest_<id>`. Confirm that listing/filtering by `senderType = 'user'` and possible future ownership checks account for guest IDs if you want them to use agent messages.

### 3.3 Low priority: Consistency and observability

- **Response shape:** POST returns the raw created message; GET returns an array. If the rest of your API standardizes on `{ ok: true, data: ... }`, consider wrapping for consistency (optional).
- **Logging:** Optional: log POST (e.g. missionId, userId, no PII) for debugging and abuse detection.
- **Indexes:** Existing indexes on `missionId`, `(missionId, channel)`, `createdAt`, `taskId` are sufficient for current usage.

---

## 4. Checklist (Before / After Deployment)

- [ ] **Apply migration** in all environments (`prisma migrate deploy`); already applied in dev.
- [ ] **Run Prisma generate** in CI/build so TypeScript and Prisma client stay in sync.
- [ ] **Decide GET policy:** Implement ownership check for `missionId` (e.g. via OrchestratorTask.userId) or explicitly accept “any authenticated user can query any missionId” and document it.
- [ ] **Optional:** Add rate limit and max `text` length for POST.
- [ ] **Optional:** Add a quick smoke test (POST then GET with same missionId) in your test suite.

---

## 5. Conclusion

- **Current system structure:** Not broken or destabilized by this implementation; schema and routes are additive and consistent with existing patterns.
- **Main risk:** GET allows any authenticated user to read messages for any `missionId`; mitigate with mission/task ownership checks when `missionId` is an OrchestratorTask id (and define policy for generic IDs).
- **Recommendation:** Implement the minimal safe patch for GET (scope by OrchestratorTask ownership when applicable) and add rate limiting for POST before heavy or production use.
