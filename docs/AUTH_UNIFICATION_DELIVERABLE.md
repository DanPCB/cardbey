# Auth Unification + Mobile Compatibility — Deliverable

## Summary

- **Existing endpoints unchanged:** `/api/auth/register`, `/api/auth/login`, `/api/auth/me` (now delegate to `authService`; same response shape).
- **New mobile-compat endpoints** at root: `POST /users`, `POST /oauth/login`, `GET /oauth/me`, `POST /password/request`, `POST /password/reset`, `POST /auth/google`, `POST /auth/facebook` (501).
- **Guest → claim flow:** `guestSessionId` cookie/header, persisted on `DraftStore`; `POST /api/draft-store/claim` (requireAuth) claims drafts by guest session.
- **Publish gating:** Optional `PUBLISH_REQUIRES_AUTH` (401 when not authed); when authed, optional `ENABLE_EMAIL_VERIFICATION` (403 when not verified). Commit supports both auth-based commit (Bearer + `acceptTerms`) and legacy email+password signup-and-commit.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/prisma/schema.prisma` | Added `PasswordResetToken` model; added `DraftStore.guestSessionId`, `DraftStore.ownerUserId` (+ relation), indexes. |
| `apps/core/cardbey-core/src/services/auth/authService.js` | Already present; added validation codes `MISSING_FIELDS`, `PASSWORD_TOO_SHORT` for register/login. |
| `apps/core/cardbey-core/src/services/auth/passwordResetService.js` | **New.** Request reset (hashed token, email via mailer), reset with token, optional JWT in response. |
| `apps/core/cardbey-core/src/routes/auth.js` | Register/login now call `registerWithEmailPassword` / `loginWithEmailPassword`; same responses. |
| `apps/core/cardbey-core/src/routes/mobileCompatAuth.js` | **New.** Mobile compat router: `/users`, `/oauth/login`, `/oauth/me`, `/password/request`, `/password/reset`, `/auth/google`, `/auth/facebook`. |
| `apps/core/cardbey-core/src/server.js` | Mount `mobileCompatAuthRouter` at root. |
| `apps/core/cardbey-core/src/middleware/guestSession.js` | **New.** Sets `req.guestSessionId` from cookie or `X-Guest-Session`; creates cookie if missing. |
| `apps/core/cardbey-core/src/routes/draftStore.js` | `POST /generate`: `guestSessionId` + `optionalAuth`, pass `meta.guestSessionId` and `meta.ownerUserId`. New `POST /claim`. Commit: `optionalAuth`, auth path (userId + acceptTerms), 401 when `PUBLISH_REQUIRES_AUTH`, 403 when email not verified. |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | `createDraft`: persist `guestSessionId`, `ownerUserId`. `commitDraft`: optional `userId` for auth-based commit. |

---

## Prisma Migration

- **Name:** `auth_unification_password_reset_and_draft_claim` (or run `npx prisma migrate dev --name auth_unification_password_reset_and_draft_claim`).
- **Note:** If you see P3006 (e.g. duplicate column in an older migration), fix the existing migration history or shadow DB before re-running.

---

## Endpoint List and Sample Payloads

### Existing (unchanged behavior)

- **POST /api/auth/register**  
  Body: `{ email, password, fullName?, displayName? }`  
  Response (201): `{ ok: true, token, user }`

- **POST /api/auth/login**  
  Body: `{ email?, username?, password }`  
  Response (200): `{ ok: true, token, accessToken, user }`

- **GET /api/auth/me**  
  Header: `Authorization: Bearer <token>`  
  Response (200): `{ ok: true, user }`

### Mobile compat (new, at root)

- **POST /users** (register)  
  Body: `{ email, password, name? }`  
  Response (201): `{ ok: true, token, access_token: token, user }`  
  Errors: 409 email exists, 400 validation.

- **POST /oauth/login** (login)  
  Body: `{ email, password }` or `{ username, password }`  
  Response (200): `{ ok: true, token, access_token: token, user }`  
  Errors: 401 invalid credentials, 400 missing fields.

- **GET /oauth/me**  
  Header: `Authorization: Bearer <token>`  
  Response (200): `{ ok: true, user }`

- **POST /password/request**  
  Body: `{ email }`  
  Response (200): `{ ok: true }` (always; does not reveal existence).

- **POST /password/reset**  
  Body: `{ email, token, newPassword }`  
  Response (200): `{ ok: true, token? }` (optional JWT for auto-login).  
  Errors: 400 invalid/expired token or mismatch.

- **POST /auth/google**, **POST /auth/facebook**  
  Response (501): `{ ok: false, code: "OAUTH_NOT_CONFIGURED", message: "OAuth login not configured in cardbey-core yet." }`

### Draft and publish

- **POST /api/draft-store/generate**  
  Uses `guestSessionId` (cookie or header) and optional auth; drafts get `guestSessionId` and, when authed, `ownerUserId`.

- **POST /api/draft-store/claim** (requireAuth)  
  Body: `{ draftId? }` or `{}`. Cookie `guestSessionId` or header `X-Guest-Session`.  
  Response (200): `{ ok: true, claimedCount, draftIds }`

- **POST /api/draft-store/:draftId/commit**  
  - With **Bearer token**: commit as that user; body needs `acceptTerms: true` and optional `businessName`, `businessType`, `location`.  
  - Without auth: legacy body `email`, `password`, `name`, `acceptTerms`, etc.  
  - When `PUBLISH_REQUIRES_AUTH=true`: unauthed requests get 401 `{ code: "AUTH_REQUIRED" }`.  
  - When `ENABLE_EMAIL_VERIFICATION` and user not verified: 403 `{ code: "EMAIL_NOT_VERIFIED", email }`.

---

## Env Vars

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Required in production; no fallback. |
| `ENABLE_EMAIL_VERIFICATION` | `true`/`1` to send verification/reset emails when mail is configured. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `MAIL_SECURE` | SMTP for reset/verification emails. |
| `APP_PUBLIC_URL` | Base URL for reset link in email (e.g. `https://app.example.com`). |
| `PASSWORD_RESET_EXPIRY_MINUTES` | Optional; default 60. |
| `PUBLISH_REQUIRES_AUTH` | Optional; `true`/`1` to return 401 for unauthed commit. |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing store-creation (draft → review → publish) | No change to legacy commit: email+password still works. Auth path is additive (Bearer + acceptTerms). |
| Breaking `/api/auth/*` clients | Register/login delegate to authService; response shape and status codes unchanged. |
| Reset token leakage | Only `tokenHash` (SHA-256) stored; raw token sent once in email. |
| Guest session fixation | Cookie httpOnly, sameSite=Lax, secure in prod; 7-day maxAge. |
| OAuth misuse | Google/Facebook endpoints return 501; no token acceptance. |

---

## Manual QA / Curl

1. **POST /users**  
   `curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"password\":\"secret123\",\"name\":\"Test\"}"`  
   Expect 201 and `token`, `user`.

2. **POST /oauth/login**  
   `curl -X POST http://localhost:3000/oauth/login -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"password\":\"secret123\"}"`  
   Expect 200 and `token`, `user`.

3. **POST /password/request**  
   `curl -X POST http://localhost:3000/password/request -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\"}"`  
   Expect 200 `{ ok: true }` (for any email).

4. **POST /password/reset**  
   Use token from email (or DB for tests):  
   `curl -X POST http://localhost:3000/password/reset -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"token\":\"<raw-token>\",\"newPassword\":\"newsecret123\"}"`  
   Expect 200 and optional `token`.

5. **Guest draft → login → claim**  
   Create draft (no auth, cookie or `X-Guest-Session` set), then register/login, then `POST /api/draft-store/claim` with Bearer token and same guest session; expect `claimedCount >= 1`, `draftIds`.

6. **Web flow**  
   Confirm `/api/auth/register`, `/api/auth/login`, `/api/auth/me` still work as before.
