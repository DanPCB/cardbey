# Campaign POST auth logging – deliverables

## Summary

Ensure `POST /api/campaign/validate-scope` and `POST /api/campaign/create-from-plan` are consistently authenticated when called from mission step handlers. Added non-prod server logs and dev-only client logs to diagnose why `create-from-plan` was seen as "anon" (404).

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/campaignRoutes.js` | Both POST handlers already use `requireAuth`. Added one-line non-prod log at start of each handler: `[Campaign] POST /validate-scope authenticated\|anon` and `[Campaign] POST /create-from-plan authenticated\|anon` (gated by `NODE_ENV !== 'production'`). |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | Confirmed `postCampaignValidateScope` and `postCampaignCreateFromPlan` use `apiPOST` → `request()` with `buildAuthHeader()` and default `credentials: 'include'`. Added dev-only log when path is `campaign/validate-scope` or `campaign/create-from-plan`: logs whether `Authorization` header is set (no token value). |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/stepHandlers.ts` | No code change. Confirmed: step handlers call `postCampaignValidateScope` and `postCampaignCreateFromPlan` from `@/lib/api`; no direct `fetch` or `credentials` override. |

## Root cause and next steps

- **If server logs "anon" for create-from-plan:** Client log shows whether the Authorization header is sent. If not set, fix token availability in mission execution context (same storage as rest of app) or ensure proxy does not strip the header.
- **If server logs "authenticated" but create-from-plan still returns 404:** 404 is likely "plan not found" (e.g. wrong/missing `planId` in mission artifacts). Fix `planId` flow (validate-scope → artifacts.planId → create-from-plan) rather than auth.
- **Unauthenticated requests:** `requireAuth` returns 401 when no token; handlers also return 401 when `!userId`. So unauthenticated callers should get 401, not 404.

## Manual QA steps

1. **Run mission (authenticated)**  
   - Log in to the dashboard.  
   - Open a mission that runs "Validate campaign scope" and "Create campaign" (e.g. "plan and run 2 week promotion campaign for my new bakery").  
   - Start/run the mission.

2. **Server logs (core, non-prod)**  
   - In the terminal running `cardbey-core`, confirm:  
     - `[Campaign] POST /validate-scope authenticated`  
     - `[Campaign] POST /create-from-plan authenticated`  
   - If either shows `anon`, the request reached the handler without `req.user` (e.g. token not sent or not accepted).

3. **Client logs (dashboard, dev)**  
   - In the browser console, confirm for the same run:  
     - `[Campaign API] .../campaign/validate-scope Authorization header: set`  
     - `[Campaign API] .../campaign/create-from-plan Authorization header: set`  
   - If "not set", fix token/header in mission context or proxy.

4. **Response and PhaseOutputs**  
   - `create-from-plan` should return **200** with `campaignId` when auth and plan are valid.  
   - Mission PhaseOutputs should load plan/campaign (no 404 for GET `/api/campaign/plan` and GET `/api/campaign/by-mission` once plan/campaign exist).

5. **Unauthenticated (optional)**  
   - In dev, call both POSTs without Authorization (e.g. from a different tab or curl).  
   - Expect **401** from both, not 404.

## Debug log gating

- **Server:** Logs only when `process.env.NODE_ENV !== 'production'`.  
- **Client:** Log only when `isDev` (import.meta.env.DEV or localhost). No token value is logged.

Remove or keep gated any temporary debug logs after verification; current implementation keeps them dev/non-prod only.
