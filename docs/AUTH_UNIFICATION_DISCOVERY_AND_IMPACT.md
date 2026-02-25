# Auth Unification + Mobile Compatibility — Discovery & Impact Report

**Date:** 2025-02-17  
**Scope:** cardbey-core as single auth backend; mobile compat endpoints; guest → claim → publish.  
**Rule:** Additive only. No removal or broad refactor of existing auth.

---

## STEP 0 — Discovery Summary

### 1) Current auth routes and logic

| Location | Purpose |
|----------|--------|
| **src/routes/auth.js** | POST /api/auth/register, /login, /me, /profile, PATCH /profile; POST /api/auth/request-reset, /reset; POST /api/auth/guest; email verification (request, confirm, verify). Uses bcrypt, Prisma, generateToken from middleware. |
| **src/middleware/auth.js** | extractToken (Bearer, query, cookie); requireAuth, optionalAuth; generateToken(userId), generateGuestToken() → { token, userId }. JWT_SECRET (with dev fallback). |
| **src/services/email/mailer.js** | sendMail({ to, subject, html }). Gated by ENABLE_EMAIL_VERIFICATION and MAIL_HOST. |
| **src/services/email/templates/verifyEmail.js** | getVerifyEmailContent (verification links). |
| **src/routes/oauth.js** | GET /api/oauth/status, /providers — status only, no login. |
| **src/routes/oauth-full.js** | Facebook/TikTok redirect flow (start → callback → upsert user → set cookie). No POST /auth/google or token-based social login. |

**Password reset today:**  
- POST /api/auth/request-reset: stores **plain** resetToken on User, sets resetExpires; does **not** send email.  
- POST /api/auth/reset: finds user by resetToken, updates passwordHash, clears token.  
**Gap:** Reset tokens are plain and not sent by email. New compat flow will use a separate PasswordResetToken table (hashed token) and sendMail.

### 2) Prisma schema

**User:**  
- id, email, passwordHash, displayName, fullName, handle, roles, role, emailVerified, verificationToken, verificationExpires, **resetToken**, **resetExpires**, createdAt, updatedAt.  
- No tokenVersion.

**DraftStore:**  
- id, mode, status, input, preview, generationRunId, committedStoreId, **committedUserId**, ipHash, userAgent, etc.  
- **No ownerUserId.** **No guestSessionId.**  
- committedUserId is set at commit time (user who committed), not “owner of draft”.

**Conclusion:** Add **ownerUserId** (nullable) and **guestSessionId** (nullable) to DraftStore. Add **PasswordResetToken** model for secure reset flow used by compat endpoints.

### 3) cardbey-rn

- **Not present in workspace.** Expected response shapes inferred from common mobile patterns and spec:
  - **POST /users (register):** body `{ email, password, name? }` → response `{ token, user: { id, email, name } }` (and optionally access_token, ok).
  - **POST /oauth/login:** body `{ email, password }` or `{ username, password }` → `{ token, user }`.
  - **POST /password/request:** `{ email }` → `{ ok: true }` (no info leak).
  - **POST /password/reset:** `{ email, token, newPassword }` → `{ ok: true }` and optionally `{ token }` for auto-login.

Compat endpoints will return **both** `token` and `access_token` where applicable to avoid client mismatch.

### 4) Draft creation and commit

- **createDraft** (draftStoreService.js): no ownerUserId or guestSessionId; accepts meta (ipHash, userAgent, generationRunId).  
- **commitDraft**: accepts email, password, name, acceptTerms; creates/gets user, creates Business, links draft via committedStoreId/committedUserId.  
- **Mount:** app.use('/api/auth', authRoutes); app.use('/api/draft-store', draftStoreRoutes).  
- Mobile compat routes will be mounted at **root** so paths are exactly **POST /users**, **POST /oauth/login**, etc. (per spec).

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Breaking /api/auth/* or existing clients | No changes to existing auth route handlers except optional delegation to shared authService. New routes only. |
| Breaking draft → review → publish | Additive: new fields (ownerUserId, guestSessionId) nullable; createDraft and commitDraft unchanged until we wire guestSessionId in create and optional requireAuth path in commit. Claim is a new endpoint. |
| Password reset: existing request-reset/reset | Leave /api/auth/request-reset and /api/auth/reset as-is. New POST /password/request and /password/reset use PasswordResetToken table and sendMail. |
| JWT format change | authService uses same generateToken(userId) from middleware. No change to token shape. |
| OAuth | No token-based Google/Facebook verification in core. POST /auth/google and /auth/facebook return 501 with clear message. |

---

## Implementation order

1. **authService.js** — Extract registerWithEmailPassword, loginWithEmailPassword, getMe from auth.js; auth routes call service (behavior unchanged).  
2. **Prisma** — Add PasswordResetToken model; add DraftStore.guestSessionId and DraftStore.ownerUserId.  
3. **Mobile compat router** — POST /users, POST /oauth/login, GET /oauth/me, POST /password/request, POST /password/reset (with new token table and sendMail), POST /auth/google, POST /auth/facebook (501). Mount at root.  
4. **Guest session** — Middleware or helper to set/read guestSessionId cookie; createDraft saves guestSessionId when unauthed.  
5. **POST /api/draft-store/claim** — requireAuth; claim drafts by guestSessionId; set ownerUserId.  
6. **Publish gating** — Document; optionally ensure commit returns 401 when auth required and no credentials (current commit accepts email/password for signup, so no forced change).  

---

## Env vars (for deliverable)

- **JWT_SECRET** — Required in production (no fallback in prod).  
- **ENABLE_EMAIL_VERIFICATION** — 'true' | '1' to enable verification and mail.  
- **MAIL_HOST**, **MAIL_PORT**, **MAIL_USER**, **MAIL_PASS**, **MAIL_FROM_EMAIL**, **MAIL_FROM_NAME** — SMTP.  
- **APP_PUBLIC_URL** — Base URL for reset/verification links (e.g. https://app.cardbey.com).  
- **ALLOW_GUEST_AUTH** — 'true' to allow POST /api/auth/guest in production.
