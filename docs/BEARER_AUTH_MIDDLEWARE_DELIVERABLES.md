# Bearer auth middleware – deliverables

## Summary

Ensure `Authorization: Bearer <token>` is correctly parsed and sets `req.user` before route handlers run. The backend was logging "anon" for POST /api/campaign/create-from-plan despite the frontend sending the header; auth middleware was updated to be more robust and to add dev-only logging to confirm Bearer parsing and `req.user` assignment.

## Risk (assessed)

- **Authenticated routes:** campaign, draft-store, ops, admin, and any route using `requireAuth` depend on the same auth middleware. Changes are limited to: (1) case-insensitive Bearer prefix and `req.get('Authorization')` fallback, (2) dev-only logs. No change to 401 behavior or to which routes use requireAuth.
- **Impact:** If a proxy or client sent "bearer " (lowercase), token is now extracted. Dev logs help confirm that Bearer is present and `req.user` is set.

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/middleware/auth.js` | **extractToken:** Use `req.headers.authorization \|\| req.get('Authorization')`; accept `Bearer ` or `bearer ` (case-insensitive via `.toLowerCase().startsWith('bearer ')`); `.trim()` extracted token. **requireAuth:** Dev-only log at start: `bearerPresent`, `tokenExtracted`, `tokenSource` (authorization/query/cookie). Dev-only log when setting req.user: `[Auth] Bearer parsed, req.user set` with `userId` and `source` (dev-admin-token | guest | jwt-db). All dev logs gated by `process.env.NODE_ENV !== 'production'`. |
| `apps/core/cardbey-core/src/server.js` | Added **middleware order** comment block above `cookieParser()`: documents CORS → cookieParser → body → requestTap → request log → static → API mounts; states that auth is per-route (requireAuth), not global, and that for campaign POST the order is route match → requireAuth (reads Bearer, sets req.user) → handler. |

## Middleware order (diagram)

```
Request
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. CORS (skip for /api/stream)                                   │
│ 2. cookieParser()                                                │
│ 3. Body: jsonParser / urlencoded (skip for SSE)                  │
│ 4. requestTap("SERVER")  ← logs /api/stream only                │
│ 5. Request logging (method, path, url)  ← does not touch req.user│
│ 6. Static: /uploads, /catalog-cutouts, /assets                   │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. API route mounts (e.g. app.use('/api/campaign', campaignRoutes))│
└─────────────────────────────────────────────────────────────────┘
   │
   ▼  POST /api/campaign/create-from-plan
┌─────────────────────────────────────────────────────────────────┐
│ campaignRoutes:  router.post('/create-from-plan', requireAuth, handler)│
│   │                                                              │
│   ├─ requireAuth:  extractToken(req) → Authorization: Bearer ... │
│   │                verify token → req.user = user, req.userId = id│
│   │                next()                                         │
│   │                                                              │
│   └─ handler:  uses req.user (already set)                      │
└─────────────────────────────────────────────────────────────────┘
```

There is **no** global “auth resolution” middleware before routes. Auth runs only when a route that uses `requireAuth` is matched; `requireAuth` reads Bearer, verifies, and sets `req.user` before calling the route handler.

## requireAuth behavior (confirmed)

- **Does it check req.user?** It does not check `req.user` at the start; it derives the user from the token and then sets `req.user`. Route handlers may then check `req.user` (e.g. campaign handlers return 401 if `!req.user?.id`).
- **How is req.user populated?** By `requireAuth`: from dev-admin-token (dev only), guest JWT, or JWT + DB lookup; then `req.user = user` and `next()`.
- **Is Bearer token parsed and verified?** Yes. `extractToken` reads `Authorization` (or `req.get('Authorization')`), accepts `Bearer ` or `bearer ` (case-insensitive), then `jwt.verify(token, JWT_SECRET)`; then DB lookup for non-guest.
- **Is only cookie session supported?** No. Order is: Authorization header first, then query token, then cookie. Bearer is the primary and is fully supported.

## Manual QA steps

1. **POST with Authorization (dev)**
   - Call `POST /api/campaign/create-from-plan` with header `Authorization: Bearer <valid-jwt>` (or `Authorization: Bearer dev-admin-token` in non-production) and body `{ "planId": "<valid-plan-id>" }`.
   - **Acceptance:** Server logs (non-prod) show:
     - `[Auth] requireAuth { method: 'POST', path: '/create-from-plan', bearerPresent: true, tokenExtracted: true, tokenSource: 'authorization' }`
     - `[Auth] Bearer parsed, req.user set { userId: '...', source: 'jwt-db' }` (or `dev-admin-token` / `guest`)
     - `[Campaign] POST /create-from-plan authenticated`
   - **Acceptance:** Response is **200** with `campaignId` (or expected error for invalid planId), not 404 from “anon”.

2. **POST without token**
   - Call `POST /api/campaign/create-from-plan` without Authorization header.
   - **Acceptance:** Response is **401** with message indicating token required. No handler log "anon" (handler does not run).

3. **Run mission from dashboard**
   - Sign in, go to /app, run a mission that triggers validate-scope and create-from-plan.
   - **Acceptance:** Server logs show `authenticated` for both POSTs; create-from-plan returns 200 when plan is valid.

4. **Dev log gating**
   - In production (`NODE_ENV=production`), ensure no `[Auth] requireAuth` or `[Auth] Bearer parsed, req.user set` logs appear (they are gated by `NODE_ENV !== 'production'`).

## If backend still shows "anon"

- Check dev logs: if `bearerPresent: false` or `tokenExtracted: false`, the header is not reaching the server — verify proxy forwards `Authorization` and that the client sends it.
- If `bearerPresent: true` and `tokenExtracted: true` but no "Bearer parsed, req.user set" log, token verification or DB lookup is failing (401 should be returned before the handler).
- If "Bearer parsed, req.user set" appears but the campaign handler still logs "anon", something is clearing or overwriting `req.user` after requireAuth (unexpected); inspect any middleware or code that runs between requireAuth and the handler.
