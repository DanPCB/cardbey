# Internal Marketing Agent Test – Execution Log & Manual QA Checklist

**Scenario:** French Baguette Café – Weekend Coffee Promo  
**Flow:** `apps/core/cardbey-core/scripts/marketing-agent-test-flow.js`

---

## 1. Files changed

| File | Change |
|------|--------|
| `docs/IMPACT_REPORT_MARKETING_AGENT_TEST.md` | **New.** Risk assessment; no impact on existing campaign execution. |
| `apps/core/cardbey-core/scripts/marketing-agent-test-flow.js` | **New.** E2E script: OrchestratorTask, stub agent (draft, 3 posts, banner prompt), schedule, LoyaltyProgram, Campaign DRAFT→SCHEDULED→RUNNING, AuditEvent for all transitions, debug logs. |
| `apps/core/cardbey-core/package.json` | **Added** script: `"test:marketing-agent": "node scripts/marketing-agent-test-flow.js"`. |
| `docs/MARKETING_AGENT_TEST_QA_CHECKLIST.md` | **New.** This file: execution log format, manual QA checklist. |

---

## 2. How to run

From repo root (or from `apps/core/cardbey-core`):

```bash
cd apps/core/cardbey-core
pnpm test:marketing-agent
# or
node scripts/marketing-agent-test-flow.js
```

**Required:** `DATABASE_URL` in env (e.g. `.env` or `file:./prisma/dev.db`).  
**Optional:** `DEV_TENANT_ID`, `DEV_STORE_ID` (defaults: `test-tenant-marketing-agent`, `test-store-marketing-agent`).

---

## 3. Execution log format

The script prints:

1. **Debug logs** (per step):
   - `[Agent input]` – step name and input payload
   - `[Agent output]` – stub outputs (campaign draft, social posts, banner prompt)
   - `[OrchestratorTask status]` – taskId and status after each transition
   - `[Scheduled state]` – scheduledTimes (Sat 9AM, Sun 9AM)
   - `[Final scheduled state]` – full result (campaignId, loyaltyProgramId, scheduledTimes, etc.)

2. **E2E lines** – high-level steps:
   - Starting message
   - OrchestratorTask created (taskId, status, entryPoint)
   - OrchestratorTask transition queued→running (+ auditEventId)
   - LoyaltyProgram created
   - Campaign created (DRAFT)
   - Campaign transition DRAFT→SCHEDULED
   - Campaign transition SCHEDULED→RUNNING
   - OrchestratorTask transition running→completed
   - Completion summary (taskId, campaignId, loyaltyProgramId, finalScheduledState)

3. **Execution log (summary)** – JSON lines at the end:
   - `{ "ts": "...", "msg": "...", "detail": { ... } }` for each step.

Example (abbreviated):

```
[E2E] Starting Internal Marketing Agent Test (French Baguette Café – Weekend Coffee Promo)
[E2E] OrchestratorTask created {"taskId":"...","status":"queued","entryPoint":"marketing_agent_test"}
...
[E2E] Campaign transition {"from":"SCHEDULED","to":"RUNNING"}
[E2E] OrchestratorTask transition {"from":"running","to":"completed","auditEventId":"..."}
[E2E] Internal Marketing Agent Test completed successfully. {"taskId":"...","campaignId":"...","finalScheduledState":{...}}

--- Execution log (summary) ---
{"ts":"...","msg":"Starting Internal Marketing Agent Test..."}
...
```

---

## 4. Manual QA checklist

Use this to verify the flow and that existing marketing/campaign behavior is unchanged.

### 4.1 Prerequisites

- [ ] Core app uses a reachable DB (e.g. `DATABASE_URL=file:./prisma/dev.db`).
- [ ] From `apps/core/cardbey-core`, `pnpm test:marketing-agent` runs without module errors.

### 4.2 Run and console output

- [ ] Script exits with code 0.
- [ ] Console shows `[Agent input]` and `[Agent output]` for campaign_draft, social_posts, banner_prompt.
- [ ] Console shows `[OrchestratorTask status]` at least for `queued`, `running`, `completed`.
- [ ] Console shows `[Final scheduled state]` with `campaignId`, `scheduledTimes` (Sat 9AM, Sun 9AM), `socialPostsCount: 3`, `bannerPrompt`.
- [ ] Execution log (summary) at the end contains multiple JSON lines with `ts`, `msg`, and where applicable `detail`.

### 4.3 Database (AuditEvent)

- [ ] **OrchestratorTask:** One row with `entryPoint = 'marketing_agent_test'`, `status = 'completed'`, `request` and `result` JSON populated.
- [ ] **AuditEvent (OrchestratorTask):** At least two rows with `entityType = 'OrchestratorTask'`, `action = 'status_transition'`: one `queued→running`, one `running→completed`.
- [ ] **AuditEvent (Campaign):** At least three rows with `entityType = 'Campaign'`, `action = 'status_transition'`: create (→DRAFT), DRAFT→SCHEDULED, SCHEDULED→RUNNING.
- [ ] **Campaign:** One row with `title = 'Weekend Coffee Promo'`, `status = 'RUNNING'`, `data` containing `socialPosts` (3), `scheduledTimes`, `bannerPrompt`, `loyaltyProgramId`.
- [ ] **LoyaltyProgram:** One row with `name` containing “Buy 5 Get 1 Free” (or “Weekend Coffee”), `stampsRequired = 5`, `reward` = “1 free coffee”.

Example queries (SQLite):

```sql
SELECT id, entryPoint, status, request, result FROM OrchestratorTask WHERE entryPoint = 'marketing_agent_test' ORDER BY createdAt DESC LIMIT 1;
SELECT id, entityType, entityId, action, "fromStatus", "toStatus", reason, "createdAt" FROM AuditEvent WHERE entityType IN ('OrchestratorTask','Campaign') ORDER BY createdAt DESC LIMIT 20;
SELECT id, title, status, data FROM Campaign ORDER BY createdAt DESC LIMIT 1;
SELECT id, name, "stampsRequired", reward FROM LoyaltyProgram ORDER BY createdAt DESC LIMIT 1;
```

### 4.4 No regression to existing flows

- [ ] Existing orchestra/build_store flow still works (e.g. `POST /api/mi/orchestra/start` with `goal: 'build_store'` → job completes).
- [ ] No new production API routes were added for campaign execution; campaign list/detail (if any) unchanged.
- [ ] Promo creation and Smart Object / content studio flows unchanged (smoke check or existing tests).

---

## 5. Optional cleanup

Repeated runs create new Campaign and LoyaltyProgram rows. To clean up test data (optional):

- Delete `OrchestratorTask` where `entryPoint = 'marketing_agent_test'`.
- Delete `AuditEvent` where `entityId` in those task IDs or in test campaign IDs.
- Delete `Campaign` where `title = 'Weekend Coffee Promo'` (and optionally match `data.scenario`).
- Delete `LoyaltyProgram` where `tenantId = 'test-tenant-marketing-agent'` and `name` like '%Weekend Coffee%'.

Or use a separate test DB for this script (`DATABASE_URL=file:./prisma/test.db`).
