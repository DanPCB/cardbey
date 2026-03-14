# Cardbey Auth Map & Email Integration Recommendation

**Scope:** Audit of authentication stack and email handling. No code changes; map + recommendation only.

---

## 1) Auth Map — Files & Flow

### Stack: **Custom (no Supabase/Clerk/NextAuth/Firebase/Cognito)**

- **Backend:** JWT (jsonwebtoken) + bcrypt + Prisma `User` model.
- **Session:** Stateless; no server-side session store. Client holds JWT in localStorage; every API call sends `Authorization: Bearer <token>`.
- **Token storage (dashboard):** `apps/dashboard/cardbey-marketing-dashboard/src/lib/storage.ts` — keys like `cardbey_${ENV}_bearer`, `cardbey_${ENV}_auth_token`. Tokens are read by `getTokens()` and sent via `buildAuthHeader()` in `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`.

### Login / Session Flow

| Step | Where | What |
|------|--------|------|
| 1. Login UI | Dashboard (e.g. Login modal, SignupModal) | User submits email + password. |
| 2. API call | `api.ts` → `apiPOST('/auth/login', body)` | Request goes to Core. |
| 3. Backend | `apps/core/cardbey-core/src/routes/auth.js` | `POST /api/auth/login` → `loginWithEmailPassword()` in `authService.js`. |
| 4. Auth service | `apps/core/cardbey-core/src/services/auth/authService.js` | Validates credentials, loads User from DB, returns `{ user, token }`. Token = `generateToken(user.id)` from `middleware/auth.js`. |
| 5. Client | After login | Client stores token (e.g. `setAuthToken(token)` / bearer key) and may call `GET /api/auth/me` to get full user. |
| 6. Session check | Dashboard | `useCurrentUser()` in `apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts` uses React Query with key `['currentUser', tokenUserId]`; `queryFn` calls `getCurrentUser()` from `lib/api.ts`, which does `apiGET("/auth/me")` (path resolves to Core’s `/api/auth/me`). |
| 7. Protected routes | Core | `requireAuth` in `apps/core/cardbey-core/src/middleware/auth.js`: extracts token (header / query / cookie), verifies JWT, loads User from DB, sets `req.user` / `req.userId`. Guest tokens (`role: 'guest'`) skip DB and set `req.user = { id, role: 'guest' }`. |

### Email Verification State & Publish Gating

- **User fields (Prisma):** `User.emailVerified` (Boolean, default false), `verificationToken`, `verificationExpires`.
- **Refresh verification status:** No dedicated “refresh” endpoint. Status is returned on every `GET /api/auth/me` and `GET /api/profile` as `emailVerified` and `emailVerificationRequired` (from env `ENABLE_EMAIL_VERIFICATION`).
- **Publish gating:** When `isEmailVerificationGateEnabled()` is true (feature flag `EMAIL_VERIFICATION_GATE` or `VITE_EMAIL_VERIFICATION_GATE=1`), the dashboard shows verification banner and blocks Publish when `user.emailVerified === false` (e.g. `StorePreviewPage.tsx`, `VerificationBanner.tsx`, `DashboardEnhanced.jsx`).

### Existing Auth Endpoints (Core)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/register` | Register with email + password; returns `{ user, token }`. |
| `POST /api/auth/login` | Login with email/username + password; returns `{ user, token }`. |
| `GET /api/auth/me` | Current user (requireAuth); includes `emailVerified`, `emailVerificationRequired`. |
| `GET /api/profile` | Alias of `/me`. |
| `PATCH /api/auth/profile` | Update profile (displayName, email, etc.). |
| **Email verification** | |
| `POST /api/auth/verify/request` | Request verification email (requireAuth, rate-limited). |
| `POST /api/auth/request-verification` | Legacy path, same as above. |
| `GET /api/auth/verify/confirm?token=&redirect_uri=` | Confirm token, set `emailVerified`, redirect or JSON. |
| `GET /api/auth/verify?token=` | Confirm token, JSON only. |
| **Password reset** | |
| `POST /api/auth/request-reset` | Body: `email`. Generates token, stores on User (`resetToken`, `resetExpires`). **Does not send email** — only logs (and in dev logs token). Returns generic success message. |
| `POST /api/auth/reset` | Body: `token`, `password`. Validates token, updates password, clears reset token. |

### Middleware & Hooks (Key Files)

- **Core:** `apps/core/cardbey-core/src/middleware/auth.js` — `requireAuth`, `optionalAuth`, `extractToken`, `generateToken`, `generateGuestToken`; `requireAdmin` for platform admin.
- **Core:** `apps/core/cardbey-core/src/routes/auth.js` — all auth routes; uses `sendMail` and `getVerifyEmailContent` for verification emails only.
- **Dashboard:** `apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts` — `useCurrentUser()`, `getCurrentUser()` (delegates to `lib/api.ts`).
- **Dashboard:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` — `getCurrentUser()` (GET `/auth/me`), `buildAuthHeader`, `hasAuthCapableToken`; auth routes use JWT-only (no API key as Bearer).
- **Dashboard:** `apps/dashboard/cardbey-marketing-dashboard/src/features/auth/useGatekeeper.ts` — gates for post-draft actions (e.g. save, publish, edit); Gate 1 = account required, Gate 2 = AI entitlement.

### User Table (Relevant Fields)

- `id`, `email` (unique), `passwordHash`, `displayName`, `fullName`, `handle`, `avatarUrl`, `accountType`, `tagline`, `hasBusiness`, `onboarding`, `roles` (JSON string), `role` (e.g. owner, admin, super_admin).
- **Email/verification:** `emailVerified`, `verificationToken`, `verificationExpires`.
- **Password reset:** `resetToken`, `resetExpires`.
- No separate “provider” field; auth is email/password (+ guest JWT). OAuth status is in `apps/core/cardbey-core/src/auth/providers.js` (separate from core login flow).

---

## 2) Minimal Integration Approach (Consistent With Current Stack)

- **Email verification:** Already implemented. Ensure `ENABLE_EMAIL_VERIFICATION` and mail env (see below) are set; verification links use `sendMail` + `getVerifyEmailContent`. No change needed for flow; only ensure production mail config and optional feature flag.
- **Password reset:** Token generation and reset confirmation are implemented; **only the “send reset email” step is missing**. Add a single call to `sendMail()` in `POST /api/auth/request-reset` when a user is found (using a new template similar to `verifyEmail.js`), with link to dashboard reset page that includes `?token=...`. Dashboard already has reset flow that can call `POST /api/auth/reset` with token + new password.
- **No need to introduce Supabase/Clerk/NextAuth/etc.** for email verification or password reset; current custom JWT + Prisma + mailer is sufficient. Any new email (e.g. magic link) would fit the same pattern: generate token → store on User or dedicated table → send link via `sendMail()`.

---

## 3) Env Vars for Email / Auth

### Email sending (mailer)

| Variable | Required | Description |
|----------|----------|-------------|
| `ENABLE_EMAIL_VERIFICATION` | For verification emails | `true` or `1` to enable sending (and use MAIL_*). |
| `MAIL_HOST` | Yes (if sending) | SMTP host. |
| `MAIL_PORT` | No | Default 587. |
| `MAIL_SECURE` | No | `true` for TLS. |
| `MAIL_USER` / `MAIL_PASS` | If SMTP auth | SMTP credentials. |
| `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` | No | From address/name; default `no-reply@cardbey.com` / Cardbey. |
| `PUBLIC_API_BASE_URL` or `PUBLIC_BASE_URL` | For links in emails | Base URL for verification/reset links (e.g. Core API base for `/api/auth/verify/confirm`). |
| `PUBLIC_WEB_BASE_URL` / `FRONTEND_URL` | For redirects | Dashboard base for post-verify redirect. |

### Auth provider / JWT

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes (production) | Secret for signing/verifying JWTs. |

### Feature flags (dashboard + API)

| Variable | Description |
|----------|-------------|
| `ENABLE_EMAIL_VERIFICATION` | Core: enable verification email sending and token logic. |
| `VITE_EMAIL_VERIFICATION_GATE` or API flag `EMAIL_VERIFICATION_GATE` | Dashboard: gate Publish when user is not verified. |

---

## 4) Summary

- **Auth:** Custom JWT + Prisma User + bcrypt; session = client-held JWT; `/api/auth/me` refreshes user and email verification status.
- **Email verification:** Implemented (request → send email → confirm); status exposed on `/me`; publish gating is feature-flagged.
- **Password reset:** Request and reset endpoints exist; **request-reset does not send email** — add one `sendMail()` + reset-link template to complete the flow.
- **Minimal approach:** Keep current stack; add reset-email sending and (if needed) a dashboard reset page that calls `/api/auth/reset`; ensure mail and base URL env vars are set in production.
