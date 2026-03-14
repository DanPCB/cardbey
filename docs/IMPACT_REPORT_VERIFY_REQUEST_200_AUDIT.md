# Audit: POST /api/auth/verify/request Still Returns 200 in Production

## A. Route registration map

| Step | File | What runs |
|------|------|-----------|
| 1 | `src/server.js` | `import authRoutes from './routes/auth.js'` (line 103) |
| 2 | `src/server.js` | `app.use('/api/auth', authRoutes)` (line 707) — mounts auth router at `/api/auth` |
| 3 | `src/routes/auth.js` | `router.post('/verify/request', requireAuth, verificationRequestLimiter, verificationRequestLimiterIP, handleRequestVerification)` (line 653) |
| 4 | `src/routes/auth.js` | `router.post('/request-verification', ...)` (line 656) — same handler, legacy path |

**No other registrations:** There is no other file that registers `POST /api/auth/verify/request` or `POST /api/auth/request-verification`. No duplicate route files, no conditional auth router, no legacy handler for this path.

**Middleware order before auth:** `app.use(mobileCompatAuthRouter)` (no path) is mounted before `app.use('/api/auth', authRoutes)`. `mobileCompatAuthRouter` only defines `/users`, `/oauth/login`, `/oauth/me`, `/password/request`, `/password/reset`, `/auth/google`, `/auth/facebook`. So `POST /api/auth/verify/request` does **not** match any of those and falls through to `authRoutes`.

**Conclusion:** The only handler that can serve `POST /api/auth/verify/request` is `handleRequestVerification` in `src/routes/auth.js`.

---

## B. Actual current response source

The response body **exactly** `{"ok":true}` (no `alreadySent`, no `token`) is produced in **one place** in the codebase:

**File:** `apps/core/cardbey-core/src/routes/auth.js`  
**Function:** `handleRequestVerification`  
**Lines (success path):**

```javascript
res.json({
  ok: true,
  ...(process.env.NODE_ENV !== 'production' && { token: rawToken })
});
```

In production, `process.env.NODE_ENV === 'production'`, so the spread adds nothing and the body is exactly `{ ok: true }`.

**Code path that leads there:**

1. `requireAuth` passes (user present).
2. `verificationRequestLimiter` and `verificationRequestLimiterIP` pass.
3. Not guest; user has id; user not already verified.
4. **Current (fixed) code:** `isVerificationEmailConfigured()` is true → skip 503.
5. Cooldown passes (or first request).
6. No valid existing token (or reuse path would return `{ ok: true, alreadySent: true }`).
7. Token created, DB updated.
8. **Current (fixed) code:** `await sendVerificationEmail(...)` returns `sendResult.sent === true` → skip 503.
9. `res.json({ ok: true })`.

So in the **fixed** code, 200 `{"ok":true}` only happens when config is OK and the provider actually sends. If the **old** code (before the safety fix) is running, it never checks config or send result and always returns 200 after updating the DB and firing off the email (fire-and-forget).

---

## C. Why the fix is not taking effect

The in-repo code **does** implement the honest-status behavior (503 when not configured or send fails). So production is not running that code.

**Most likely cause: the commit with the safety fix has not been deployed to Render.**

Possible reasons:

1. **cardbey-core is a submodule**  
   Render might build from the parent repo. If the submodule pointer for `apps/core/cardbey-core` was not updated after the fix was committed inside cardbey-core, the build uses an old commit and the old handler.

2. **Render builds from a branch/ref that doesn’t have the fix**  
   The fix might be on another branch or not yet merged into the branch Render uses.

3. **No redeploy after the fix**  
   The fix was merged but Render was not triggered to redeploy (e.g. no deploy on push, or manual deploy not run).

4. **Build or runtime cache**  
   Less likely if Render does a clean build, but cached dependencies or a stale runtime could in theory serve old code.

**Evidence that points to “old code”:**

- Response is exactly 200 `{"ok":true}` — matches the **old** handler’s success response.
- Expected 503 (EMAIL_NOT_CONFIGURED / EMAIL_SEND_FAILED) never appears — old handler never returns 503 for this.
- Expected Render logs (`[Auth] verify/request received`, `config validation`, etc.) are missing — old handler did not have those logs.

So the handler that is **actually** bound to `POST /api/auth/verify/request` in production is the **pre–safety-fix** version of `handleRequestVerification` (no config check, no await of send, no 503).

---

## D. Exact minimal code changes

**1. Ensure the correct code is deployed (required)**

- Push the commit(s) that contain the email verification safety fix to the branch Render builds from.
- If cardbey-core is a submodule: in the parent repo, update the submodule to that commit and push the parent.
- In Render: trigger a new deploy (e.g. “Clear build cache & deploy” or “Manual deploy”) so the service runs the updated `src/routes/auth.js`.

**2. Deploy verification (already added in repo)**

- **Response header:** At the start of `handleRequestVerification`, `res.setHeader('X-Verify-Handler', 'honest-status')` was added. So every response from this handler (200, 429, 503) will include `X-Verify-Handler: honest-status`. If production returns 200 **without** this header, the old handler is still running.
- **GET /api/auth/verify/status:** New endpoint (no auth) that returns:
  - `{ ok: true, emailConfigured: boolean, handlerVersion: 'honest-status' }`  
  So you can `curl https://cardbey-core.onrender.com/api/auth/verify/status` and check:
  - If you get `handlerVersion: 'honest-status'` and `emailConfigured: false`, the new code is live and POST should return 503 when email is not configured.
  - If you get 404 or no `handlerVersion`, the new code is not deployed.

No other code changes are required for the “honest status” behavior; it is already implemented. The only change needed is deployment of the existing code plus use of the header and status endpoint to verify it.

---

## E. Manual verification checklist

1. **Verify deploy (after redeploy)**  
   - `curl -s https://cardbey-core.onrender.com/api/auth/verify/status`  
   - Expect: `{"ok":true,"emailConfigured":false,"handlerVersion":"honest-status"}` (when email env is not set).  
   - If 404 or missing `handlerVersion`, the new code is not deployed.

2. **Verify POST response when email is not configured**  
   - POST `https://cardbey-core.onrender.com/api/auth/verify/request` with a valid Bearer token.  
   - Expect: **503** and body with `code: 'EMAIL_NOT_CONFIGURED'`.  
   - Response headers should include **X-Verify-Handler: honest-status**.

3. **Confirm 200 only when email is configured and send succeeds**  
   - Set ENABLE_EMAIL_VERIFICATION, MAIL_*, and (in production) PUBLIC_API_BASE_URL on Render.  
   - POST again with valid Bearer.  
   - Expect: **200** and `{"ok":true}` only if the provider send succeeded; headers should include **X-Verify-Handler: honest-status**.

4. **If production still returns 200 without the header**  
   - Confirm the branch/ref and (if applicable) submodule commit that Render builds from.  
   - Confirm that commit contains `isVerificationEmailConfigured`, the 503 returns, and `X-Verify-Handler` in `handleRequestVerification`.  
   - Clear build cache and redeploy.

---

## F. Commit message

```
fix(auth): add verify/request deploy verification (X-Verify-Handler + GET /verify/status)

- Set X-Verify-Handler: honest-status on all verify/request responses to confirm new handler is running
- Add GET /api/auth/verify/status (no auth) returning emailConfigured and handlerVersion for deploy checks
- Enables diagnosing why production still returns 200 when email is not configured (old deploy)
```

---

## Risk assessment (per locked rule)

**Could these changes break store creation / auth / publish?**

- **No.**  
- Adding a response header to the verify/request handler does not change success/failure or response body.  
- Adding GET `/api/auth/verify/status` is a new, read-only endpoint and does not touch login, register, store creation, or publish.  
- Ensuring the correct code is deployed only activates the existing safety logic (503 when not configured or send fails); it does not introduce new behavior beyond what was already implemented and audited.
