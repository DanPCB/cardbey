# degradedFromPlan fix verification

## 1. Exact diff in campaignRoutes.js (this pass)

**Added:** Dev-only module-load marker so we can confirm the server is running the updated code.

```diff
 const router = Router();
+
+if (process.env.NODE_ENV !== 'production') {
+  console.log('[CampaignRoutes] loaded', 'degradedFromPlan_fix_v1');
+}
+
 /**
  * Default schedule: next Sat 09:00 and Sun 09:00.
```

**Already present (no change):** `degradedFromPlan` is defined in the same handler scope as its usages:

- **Definition (line ~714):**  
  `const degradedFromPlan = latestValidation?.degradedMode ?? plan?.degradedMode ?? degradedMode ?? null;`  
  inside `router.post('/create-from-plan', requireAuth, async (req, res) => { try { ... } })`.

- **Usages (B.3 block, lines ~929–987):**  
  Same handler, after `await prisma.$transaction(...)` and the creatives block; no nested function between definition and use, so scope is correct.

If the error persists, the process is almost certainly running an old copy of the module (see restart steps below).

---

## 2. Instructions to restart server (kill Node)

1. **Stop the core server**
   - If using a terminal: `Ctrl+C` in the terminal where the core server is running.
   - If using a script/PM2: stop that process (e.g. `pm2 stop cardbey-core` or equivalent).
   - On Windows, if needed: Task Manager → find `node` (or `tsx`/`nodemon`) for cardbey-core → End task. Or from an elevated cmd: `taskkill /F /IM node.exe` (only if no other Node apps need to stay up).

2. **Start the core server again**
   - From repo: `cd apps/core/cardbey-core && pnpm run dev` (or `npm run dev` / your usual command).
   - Wait until you see the server “Listening” log.

3. **Confirm updated code loaded**
   - In the same terminal (or logs), look for:  
     `[CampaignRoutes] loaded degradedFromPlan_fix_v1`  
   - If you see that line at startup, the process has loaded the fixed campaignRoutes module.

---

## 3. Confirmation checklist

- [ ] Core server was fully stopped (process killed) then started again.
- [ ] On startup, log shows: `[CampaignRoutes] loaded degradedFromPlan_fix_v1`.
- [ ] Run the mission again (Validate campaign scope → Create campaign).
- [ ] Create campaign step completes without `degradedFromPlan is not defined` (no 500 from that error).
- [ ] PhaseOutputs or mission execution shows success for Create campaign (200, campaignId returned).

If the marker log does not appear after a full restart, the running process is not loading this file (e.g. different cwd, different app, or cached build). Fix the startup path so this module is the one loaded.
