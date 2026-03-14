# Audit: POST /api/mi/orchestra/start returning 403

**Date:** 2026-03-13  
**Symptom:** Browser shows `POST https://cardbey-core.onrender.com/api/mi/orchestra/start` → **403**; UI later shows 404 DRAFT_NOT_FOUND (downstream of orchestra start failure).

---

## 1. Route and middleware chain

| Order | Middleware / handler | File | Can return 403? |
|-------|----------------------|------|------------------|
| 1 | **CORS** (global) | `server.js` + `config/cors.js` | **Yes** — when `origin` is not in whitelist, `corsOptions.origin` calls `callback(new Error('CORS blocked origin: ...'))`; error handler returns **403** with `error: 'origin_not_allowed'`. |
| 2 | cookieParser, body parsers | server.js | No |
| 3 | **orchestraStartLimiter** (rate limit) | `routes/miRoutes.js` | No — returns **429** when exceeded. |
| 4 | **requireAuth** | `middleware/auth.js` | **No** — returns **401** for missing/invalid token, not 403. |
| 5 | **handleOrchestraStart** | `routes/miRoutes.js` | **Yes** — returns **403** only for `guest_limit_reached` (guest + build_store + draft count ≥ max). |

So the **only two sources of 403** for this path are:

1. **CORS** — origin not in whitelist (rejection **before** route logic).
2. **handleOrchestraStart** — guest limit reached (after auth).

---

## 2. Exact 403 sources (code paths)

### A. CORS (before route)

- **Where:** `config/cors.js` → `corsOptions.origin()`; on reject, `callback(new Error('CORS blocked origin: ${origin}'))`. Then `server.js` error handler (after CORS middleware) catches errors whose message starts with `"Origin not allowed"` or `"CORS blocked origin"` and returns `res.status(403).json({ ok: false, error: 'origin_not_allowed', message: err.message })`.
- **When:** In **production**, when `req.headers.origin` is set and not in `WHITELIST` (e.g. origin is `https://cardbey.com` but whitelist has a typo, or request is from a non-whitelisted host like `http://cardbey.com` or a different subdomain).
- **Note:** OPTIONS preflight can succeed (204) while the **actual POST** is still subject to CORS origin check. So 403 on POST with successful OPTIONS is consistent with CORS rejecting the POST’s `Origin` header.

### B. Guest limit (in handler)

- **Where:** `routes/miRoutes.js` inside `handleOrchestraStart`: when `req.user?.role === 'guest'`, goal is build_store, and `orchestratorTask.count` (completed build_store in last 24h) ≥ `maxDrafts` (env `GUEST_MAX_DRAFTS` or default 1 in prod).
- **Returns:** `res.status(403).json({ ok: false, error: 'guest_limit_reached', message: 'Guest limit reached. Please sign in to continue.' })`.

---

## 3. Proxy / load balancer / config

- **Render:** Does not typically return 403 for API routes; it forwards to the Node app. If the app returns 403, the client sees it. A proxy could in theory return 403 (e.g. WAF), but the most likely app-side cause is **CORS** when the request origin is not whitelisted.
- **statusText "Not Found" with 403:** Unusual for our app (we return JSON with `error: 'origin_not_allowed'` or `'guest_limit_reached'`). If the client shows statusText "Not Found", it could be (1) client or devtools quirk, or (2) an intermediary rewriting the response. Logs will confirm which 403 path was taken.

---

## 4. Files inspected

| File | Purpose |
|------|--------|
| `server.js` | Global CORS middleware; error handler that returns 403 for CORS; route mount order (`/api/mi` with miIntentsRoutes then miRoutes). |
| `config/cors.js` | `corsOptions.origin` and `isOriginAllowed`; whitelist (BASE_WHITELIST + env). |
| `routes/miRoutes.js` | `POST /orchestra/start` with `orchestraStartLimiter`, `requireAuth`, `handleOrchestraStart`; 403 only for guest_limit_reached. |
| `middleware/auth.js` | `requireAuth` returns 401 only (no 403 for this route). |

---

## 5. Changes made (minimal diff)

**Diagnostic logging only** — no behavior change.

1. **server.js**  
   When returning 403 for CORS, log: `[CORS] 403 (origin rejected)` with `path`, `method`, `origin`, `referer`, `host`, `message`.

2. **routes/miRoutes.js**  
   - At **entry** of `handleOrchestraStart`: log `[orchestra:start] entry` with `traceId`, `path`, `method`, `origin`, `referer`, `host`, `hasAuth`, `userId`, `role`.  
   - After parsing body: log `[orchestra:start] payload` with `traceId`, `goal`, `businessName`, `businessType`.  
   - When returning **403 guest_limit_reached**: log `[orchestra:start] 403 guest_limit_reached` with `traceId`, `userId`, `count`, `maxDrafts`, `entryPoint`.

**Risk:** Logs may include origin/referer and user id; no change to auth, guest policy, or mission creation logic.

---

## 6. How to interpret logs

- **If you see `[CORS] 403 (origin rejected)`** with the request’s path and origin:  
  **403 is from CORS.** The request never reached the route. Fix by adding the request’s `Origin` (e.g. `https://cardbey.com` or `https://www.cardbey.com`) to the CORS whitelist, or set `ALLOWED_ORIGINS` / `CORS_WHITELIST` / `DASHBOARD_PRODUCTION_URL` (or similar) in Render so that origin is allowed.

- **If you see `[orchestra:start] entry`** but then **`[orchestra:start] 403 guest_limit_reached`**:  
  **403 is from guest limit.** User is a guest and has already used their allowed build_store runs; they need to sign in or wait.

- **If you never see `[orchestra:start] entry`** and also **no `[CORS] 403`**:  
  Either (1) logs are from another instance (load balancer), or (2) another middleware (e.g. rate limiter) or proxy is rejecting. Check rate limiter (returns 429, not 403) and Render/proxy logs.

---

## 7. Manual verification steps

1. **Reproduce** from the browser that gets 403 (cardbey.com or the exact origin).
2. **Check Render logs** for cardbey-core right after the failing POST:
   - **If** `[CORS] 403 (origin rejected)` appears with that path and origin → add that origin to the whitelist (or env that feeds the whitelist) and redeploy.
   - **If** `[orchestra:start] entry` appears → request reached the app; then check for `[orchestra:start] 403 guest_limit_reached` to confirm guest limit.
   - **If** neither appears → request may be hitting another instance or a proxy; verify which instance serves the request and that you’re viewing that instance’s logs.
3. **CORS whitelist:** Production whitelist includes `https://cardbey.com`, `https://www.cardbey.com`. If the page is loaded as `http://` or from another host (e.g. `https://app.cardbey.com`), add that origin or set the appropriate env var so it’s allowed.
4. **After fix:** Trigger the same POST again and confirm 200 and that mission/draft flow continues; confirm no regression for guests or signed-in users.

---

## 8. Summary

- **Exact 403 sources:** (1) **CORS** when `Origin` is not allowed (most likely if OPTIONS succeeds but POST returns 403); (2) **handleOrchestraStart** when guest build_store limit is reached.
- **Earliest rejection:** CORS runs before the route; if origin is rejected, the handler is never run.
- **Minimal diff:** Added diagnostic logs only (CORS 403, route entry, payload summary, guest_limit 403). No change to mission creation, guest policy, or store-building logic.
- **Next step:** Reproduce, inspect Render logs using the new messages, then either allow the request origin in CORS or address guest limit as needed.

---

## 9. Immediate fix for guest_limit_reached (403)

**Cause:** In production the default is **1** completed `build_store` task per guest in 24h. A previous attempt that ended in **DRAFT_NOT_FOUND** was still counted because that run was marked `status: 'completed'` instead of `failed`, so the guest hits the limit after one “failed” run.

**Fix 1 — Raise limit via env (no code change, unblocks testing now):**

1. **Render dashboard** → open the **cardbey-core** service.
2. **Environment** → Add variable:
   - **Key:** `GUEST_MAX_DRAFTS`
   - **Value:** `3`
3. **Save** → **Redeploy** the service.
4. Retry the mission from the guest session; the 403 should be gone.

**Fix 2 — Don’t count failed/abandoned (code + job runner):**

- The count in `miRoutes.js` already uses `status: 'completed'` only, so failed/abandoned tasks are not counted **if** the job runner sets status correctly.
- The real bug: a mission that ended in **DRAFT_NOT_FOUND** was marked `completed` instead of `failed`. That is a **job runner** issue: when a run fails (e.g. DRAFT_NOT_FOUND), the runner must set the task’s `status` to `'failed'` so it is not counted toward the guest limit. Fix that in the job runner separately; the route comment was updated to document this requirement.
