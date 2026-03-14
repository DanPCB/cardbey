# How to Test Agent Messages in the Chat UI

This guide walks you through seeing **orchestrator agent messages** (Planner, Research Agent, etc.) in the Agent Chat view.

## Prerequisites

- **Core API** running (e.g. `pnpm run dev` in `apps/core/cardbey-core`).
- **Dashboard** running (e.g. `pnpm run dev` in `apps/dashboard/cardbey-marketing-dashboard`).
- You are **logged in** in the dashboard (so you have a valid auth token). In dev you can use `Authorization: Bearer dev-admin-token` if your backend allows it.

---

## Step 1: Trigger an orchestrator task

The insights orchestrator creates a **task** and uses its `id` as **missionId** for agent messages. You need to call the execute endpoint and capture the returned `taskId`.

### Option A: PowerShell (Windows)

Replace `CORE_URL` with your Core API base (e.g. `http://localhost:3001`). Use your real JWT if you have one, or in dev often `dev-admin-token` works:

```powershell
$CORE_URL = "http://localhost:3001"
$TOKEN = "dev-admin-token"   # or your JWT from dashboard login

$body = @{
  entryPoint = "studio_goal_planner"
  payload = @{
    tenantId = "dev-user-id"
    timeFrame = "weekly"
  }
  context = @{}
} | ConvertTo-Json -Depth 5

$resp = Invoke-RestMethod -Uri "$CORE_URL/api/orchestrator/insights/execute" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $TOKEN" } `
  -Body $body

$taskId = $resp.taskId
Write-Host "TaskId (missionId): $taskId"
Write-Host "Open in browser: http://localhost:5174/app/back/missions/$taskId/chat"
```

### Option B: curl (macOS/Linux/WSL)

```bash
CORE_URL="http://localhost:3001"
TOKEN="dev-admin-token"   # or your JWT

resp=$(curl -s -X POST "$CORE_URL/api/orchestrator/insights/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "entryPoint": "studio_goal_planner",
    "payload": { "tenantId": "dev-user-id", "timeFrame": "weekly" },
    "context": {}
  }')

taskId=$(echo "$resp" | node -e "let d=require('fs').readFileSync(0,'utf8'); d=JSON.parse(d); console.log(d.taskId||d.error||'')")
echo "TaskId (missionId): $taskId"
echo "Open in browser: http://localhost:5174/app/back/missions/$taskId/chat"
```

### Option C: From the dashboard (browser)

1. Open DevTools → Console.
2. Get your token, e.g. from `localStorage` or the network tab after login (depends on your auth storage).
3. Run (replace `YOUR_JWT` and `CORE_URL` if needed):

```javascript
const CORE_URL = 'http://localhost:3001'; // or your core URL
const token = 'YOUR_JWT'; // or 'dev-admin-token' in dev

const res = await fetch(`${CORE_URL}/api/orchestrator/insights/execute`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    entryPoint: 'studio_goal_planner',
    payload: { tenantId: 'dev-user-id', timeFrame: 'weekly' },
    context: {}
  })
});
const data = await res.json();
const taskId = data.taskId;
console.log('TaskId:', taskId);
console.log('Open:', `${window.location.origin}/app/back/missions/${taskId}/chat`);
// Optional: open in same tab
// window.location.href = `/app/back/missions/${taskId}/chat`;
```

---

## Step 2: Open the mission chat in the dashboard

1. Copy the **taskId** from the response (e.g. `clxx...`).
2. In the browser, go to:
   ```
   http://localhost:5174/app/back/missions/<taskId>/chat
   ```
   Replace `<taskId>` with the value from step 1.  
   If the dashboard runs on a different port or origin, use that instead of `http://localhost:5174`.

3. The Agent Chat view will:
   - **GET** `/api/agent-messages?missionId=<taskId>` and show any existing messages.
   - **Subscribe to SSE** for that `missionId`, so new agent messages appear in real time.

---

## What you should see

- **Planner Agent:** “Planning: studio_goal_planner” (sent at task start).
- **Planner Agent:** “Goal plan for weekly” (or similar) when the studio goal planner handler finishes.
- For **campaign_strategy_review** you’ll also see **Research Agent** with the review summary.
- For **campaign_targeting_planner** you’ll see planner + optional internal (hidden) message.

If you open the chat **after** the task has already completed, the messages will still load via the initial GET. If you open the chat **before** or **while** the task runs, those same messages will also arrive over SSE and appear as they’re created.

---

## Entry points that emit agent messages (for reference)

| entryPoint                   | Agent messages |
|-----------------------------|----------------|
| `studio_goal_planner`       | Planner (planning + goal plan summary) |
| `campaign_strategy_review`  | Planner + Research Agent (review summary) |
| `campaign_targeting_planner`| Planner (plan + optional internal) |
| Others                      | Planner (planning line only) |

---

## Troubleshooting

- **401 on POST /api/orchestrator/insights/execute**  
  Use a valid JWT or, in dev, `Bearer dev-admin-token` if your backend allows it.

- **400 missing_context / invalid_entry_point**  
  Ensure `entryPoint` is one of the valid values and that the request includes auth so `tenantId`/`userId` can be resolved (or pass them in `context`).

- **No messages in chat**  
  1. Confirm the URL is `/app/back/missions/<taskId>/chat` with the **same** `taskId` returned by the execute call.  
  2. Check Core logs for “[createAgentMessage]” or “[SSE] Broadcast agent-message” to confirm messages are created and broadcast.  
  3. Ensure the dashboard’s API requests go to the same Core that is running the orchestrator (same base URL / proxy).
