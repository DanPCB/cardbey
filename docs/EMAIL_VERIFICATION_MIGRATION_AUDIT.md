# Email Verification + Email Sending — LEGACY → NEW Migration Audit

**Goal:** In the NEW build, implement one verification method (email link or OTP), reusing/migrating what’s possible from legacy.  
**Rule:** No breaking changes to store creation → publish → frontscreen. Additive changes and feature flags only.

---

## PHASE 0 — Evidence Scan (NO CODING)

### A) Evidence findings (file paths + short snippets)

#### 1) LEGACY Laravel (C:\Users\desig\cardbey-api)

| Area | File(s) | Finding |
|------|---------|--------|
| **Package** | `composer.json` | `"jrean/laravel-user-verification": "7.*"` |
| **Package token** | `vendor/jrean/laravel-user-verification/src/UserVerification.php` | `generateToken()` = `hash_hmac('sha256', Str::random(40), config('app.key'))` — token stored as-is in DB (64-char hex). |
| **Mail config** | `config/mail.php` | Driver: `env('MAIL_DRIVER','smtp')`, host/port/from/encryption/username/password from env. |
| **Env example** | `.env.example` | `MAIL_DRIVER=array`, `MAIL_HOST=smtp.mailtrap.io`, `MAIL_PORT=2525`, `MAIL_USERNAME=null`, `MAIL_PASSWORD=null`, `MAIL_ENCRYPTION=null`, `MAIL_FROM_ADDRESS=no-reply@example.com`, `MAIL_FROM_NAME=Hello` |
| **User verification config** | `config/user-verification.php` | `email.type` (default/markdown), `email.view` (null), `auto-login` (false). |
| **DB migration** | `database/migrations/2016_09_13_070520_add_verification_to_user_table.php` | Adds `email_verified_at` (timestamp nullable), `verified` (boolean default false), `verification_token` (string nullable). |
| **Verification routes** | `packages/Users/src/RouteRegistrar.php` | `GET /email-verification/resend` → PasswordForgotController@resend; `GET email-verification/check/{token}/{email}` → UserController@verifyEmail. |
| **Verify handler** | `packages/Users/src/Controllers/UserController.php` (277–292) | `verifyEmail($token, $email)`: find user by email; if missing/invalid/verified or token mismatch → fail; else set `verified=1`, `verification_token=null`, save. **Bug:** code sets and saves user even when `$isSuccess = false`. |
| **Login gate** | `packages/Users/src/Controllers/AuthenticateController.php` (35–36) | After successful login: `if (! $user->verified) throw UserNotVerifiedException;` — **login is gated** in legacy. |
| **Send verification** | `packages/Users/src/Repositories/Eloquent/UserBread.php` (33–34) | On user add (unless forceActive): `UserVerification::generate($user); UserVerification::send($user, 'Confirm your account!');` |
| **Resend** | `packages/Users/src/Controllers/PasswordForgotController.php` (71–79) | Resend: find user by email, `UserVerification::generate($user); UserVerification::send($user, 'Confirm your account!');` return 204. |
| **Email template** | `resources/views/vendor/laravel-user-verification/email.blade.php` (405–409) | Link: `sprintf("%s/verify-email?token=%s&email=%s", env('WEB_URL'), $user->verification_token, urlencode($user->email))`. Subject/title: “Activate your account”, “Hi {{ fullname }}”, “VERIFICATION LINK”. |
| **Laravel verify view** | `resources/views/auth/verify.blade.php` | “Verify Your Email Address”, “check your email for a verification link”, “click here to request another” (resend). |
| **Mail usage** | Various | `Mail::send()`, `Mail::to()->queue()`, Mailable classes in `app/Mail/`, Notifications in `app/Notifications/`. Password reset: `Mail::send('phpsoft.users::emails/password', ...)`. |

**Legacy verification flow summary:** Link-based. Token (64-char hex) stored in `users.verification_token`; link = `WEB_URL/verify-email?token=X&email=Y`. Frontend receives token+email; backend route is `GET email-verification/check/{token}/{email}`. No expiry in migration; jrean may add expiry elsewhere (not confirmed in scan). Login is **gated** until verified.

---

#### 2) LEGACY Web (Cardbey-web-latest)

| Area | Finding |
|------|---------|
| **Verify UI** | Grep timed out. Laravel view `auth/verify.blade.php` exists (resend link). Public link is `WEB_URL/verify-email?token=&email=` — web app likely has a `/verify-email` page that calls API `email-verification/check/{token}/{email}`. |
| **API calls** | Not confirmed in this scan (timeout). Assume web reads `token` and `email` from query and calls legacy API. |

---

#### 3) LEGACY RN (cardbey-rn)

| Area | Finding |
|------|---------|
| **Verify screens** | No dedicated “verify email” screen found. Auth flows: Login, Registration, Forgot password, Reset password (email + token from deep link). No explicit “verify email” or “resend verification” in scanned files. |
| **API** | Login/register/forgot/reset use email; no verification-specific endpoint references in snippets. |

---

#### 4) NEW Core (c:\Projects\cardbey\apps\core\cardbey-core)

| Area | File(s) | Finding |
|------|---------|---------|
| **Prisma User** | `prisma/schema.prisma` (33–35, 49) | `emailVerified Boolean @default(false)`, `verificationToken String?`, `verificationExpires DateTime?`. **No** `emailVerifiedAt`; comment in auth.js mentions it but not in schema. |
| **Request verification** | `src/routes/auth.js` (654–718) | `handleRequestVerification`: requireAuth, reject guest/already verified; generate raw 64-char token, store **hash** (SHA-256), set verificationExpires (30 min); `sendVerificationEmail(to, link)`; respond with `ok` + in dev `token`. |
| **Send email** | `src/routes/auth.js` (645–651) | `sendVerificationEmail(to, verifyLink)`: **stub** — builds full URL from PUBLIC_BASE_URL/FRONTEND_URL, `console.log` only; “TODO: integrate real email transport”. |
| **Confirm** | `src/routes/auth.js` (741–797) | GET `/api/auth/verify/confirm?token=&redirect_uri=`: find user by token (hash or plain), reject invalid/expired/already verified; set emailVerified true, clear token/expires; if `redirect_uri` (safe, starts with /) → redirect to FRONTEND_URL + redirect_uri; else JSON `{ ok, verified }`. |
| **Verify (JSON)** | `src/routes/auth.js` (804–844) | GET `/api/auth/verify?token=`: same validation, JSON only. |
| **Tests** | `tests/auth.verification.test.js` | Covers request-verification (token stored as hash, expiry), confirm, verify, expired token, already verified, one-time use, /me includes emailVerified. |
| **.env.example** | `.env.example` | No MAIL_* or SENDGRID/SES vars. |

**NEW verification flow summary:** Link-based. Raw token (32 bytes → 64 hex) generated, hashed (SHA-256), hash stored; link = `/api/auth/verify/confirm?token=<raw>`. Optional `redirect_uri` for redirect after confirm. Email sending is **stub** (log only). Login and /create Save are **not** gated by verification (per your requirements).

---

### B) Migration feasibility matrix

| Item | Reusable? | Notes |
|------|-----------|--------|
| **Provider config** | **MED** | Legacy: Laravel env (MAIL_DRIVER, MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_*). No SendGrid/SES in .env.example; defaults to SMTP (Mailtrap). NEW: no mail env yet. We can **map** same env names into a Node mailer (nodemailer SMTP). Keys/config reusable; code reimplemented in Node. |
| **Verification flow** | **HIGH** | NEW already has link-based flow (request → store hashed token + expiry → confirm). Legacy gates login; NEW will **not** gate login or /create Save, only “Publish store” (Phase 1). Flow logic is already in NEW; we only add real email sending and optional frontend. |
| **Templates** | **MED** | Legacy: Blade HTML with `$user->fullname`, `$user->verification_token`, `$user->email`, env('WEB_URL'). NEW link format differs: `/api/auth/verify/confirm?token= rawToken`. We can **migrate content** (subject, body, button text) into a simple Node template or HTML string; variables: `displayName`, `verifyLink`. |
| **DB fields** | **LOW (already done)** | Legacy: `email_verified_at`, `verified`, `verification_token`. NEW: `emailVerified`, `verificationToken`, `verificationExpires`. No migration of DB from Laravel; NEW schema is already in place. |
| **Token strategy** | **Reimplement (better)** | Legacy: single value stored in DB (hmac), used in link. NEW: raw token in link, hash in DB, 30 min expiry — **keep NEW** (more secure, one-time, expiry). |

**Recommended path:** **Hybrid** — keep NEW endpoints and token/expiry design; add Node mailer adapter using legacy-style env vars (SMTP); port template **content** (copy) into NEW; do **not** gate login or /create Save; gate only “Publish store” when `ENABLE_EMAIL_VERIFICATION` is set.

---

### C) What we can migrate directly vs reimplement

| Action | Migrate | Reimplement |
|--------|---------|-------------|
| Env vars | Use same names for SMTP: MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_ADDRESS, MAIL_FROM_NAME, MAIL_SECURE/encryption. | N/A |
| Email sending | N/A | Nodemailer (or SendGrid/SES adapter) in Node; call from existing `sendVerificationEmail()`. |
| Verification endpoints | Already in NEW. | Only ensure redirect + JSON behavior and env (e.g. FRONTEND_URL) for redirect. |
| Template | Copy subject + body text and variable names. | Implement as Node template (e.g. one HTML string or small template file) with `verifyLink`, `displayName`. |
| Token/expiry | N/A | Keep NEW (hash + expiry). |
| Login gating | N/A | Do **not** gate login in NEW (per requirement). |
| Publish gating | N/A | Add in Phase 1: if ENABLE_EMAIL_VERIFICATION and user not verified → block “Publish store” / “Make public”. |

---

### D) Proposed Node env vars (exact names)

Use these for the Node mailer (add to `.env.example` with safe defaults; do not commit secrets):

```bash
# Email (optional – if unset, verification emails are log-only stub)
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_SECURE=false
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_ADDRESS=no-reply@example.com
MAIL_FROM_NAME=Cardbey

# Already present / used for verification link and redirect
PUBLIC_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5174

# Feature flag: when 1, require email verification to publish store
ENABLE_EMAIL_VERIFICATION=0
```

No SENDGRID/SES keys in Phase 1 unless you add a second adapter; SMTP is enough to reuse legacy-style config.

---

### E) Endpoint specs + response shapes (NEW — additive only)

Existing NEW endpoints (keep as-is; document for reference):

| Method | Path | Auth | Purpose | Response (success) |
|--------|------|------|---------|--------------------|
| POST | `/api/auth/verify/request` | Bearer required | Request verification email | `{ ok: true, token?: string }` (token only in non-production) |
| POST | `/api/auth/request-verification` | Bearer required | Same as above (legacy path) | Same |
| GET | `/api/auth/verify/confirm?token=&redirect_uri=` | None | Confirm token; optional redirect | 302 to FRONTEND_URL + redirect_uri, or `{ ok: true, verified: true }` |
| GET | `/api/auth/verify?token=` | None | Confirm token; JSON only | `{ ok: true, message: "Email verified successfully" }` |

- **redirect_uri:** optional, must start with `/` (e.g. `/onboarding/business?verified=1`). In prod, use redirect; in dev can use JSON.
- **Gating:** Do **not** add auth or verification checks to login or draft commit. Only in a later PR add: “Publish store” / “Make public” returns 403 when `ENABLE_EMAIL_VERIFICATION=1` and `user.emailVerified === false`.

---

### F) PR plan with acceptance criteria + E2E checks

| PR | Scope | Acceptance criteria | E2E / checks |
|----|--------|---------------------|--------------|
| **PR1** | Prisma fields (already done); env vars in .env.example; mailer adapter (nodemailer SMTP); feature flag `ENABLE_EMAIL_VERIFICATION`; `sendVerificationEmail()` uses adapter when MAIL_HOST set and flag on. | (1) With MAIL_* set, request-verification sends one email (or mock captures). (2) With MAIL_* unset, behavior unchanged (log only). (3) No change to login, register, or draft commit. | Run auth + store-publish tests; no new failures. |
| **PR2** | Endpoints already exist; add tests for redirect_uri and JSON; optional: minor fix to redirect_uri validation. | (1) GET confirm with valid token + redirect_uri redirects to frontend. (2) GET confirm with valid token, no redirect_uri, returns JSON. (3) Invalid/expired token returns 400. | auth.verification.test.js + manual or E2E for redirect. |
| **PR3** | Frontend: banner “Verify your email” when logged in and not verified; “Publish store” / “Make public” disabled or 403 when ENABLE_EMAIL_VERIFICATION=1 and user not verified. | (1) Verified user can publish. (2) Unverified user sees banner and cannot publish when flag on. (3) Login and /create Save still work. | E2E: login → create store → publish (verified); login (unverified) → try publish → 403 or disabled. |

---

### G) “Do NOT do” list (protect store workflow)

1. **Do not** gate **login** on email verification (NEW stays open; legacy had gate).
2. **Do not** gate **draft save** or **/create Save** on verification (only publish/make-public).
3. **Do not** change existing **Prisma User** fields for verification (already present); no new required columns that break existing inserts.
4. **Do not** change **POST /api/draft-store/:draftId/commit** or **store creation** response shape or auth rules for verification.
5. **Do not** refactor or remove existing auth routes; only **add** mailer and optional gating behind `ENABLE_EMAIL_VERIFICATION`.
6. **Do not** add verification checks to **frontscreen** or **public store** APIs (read-only); they are unrelated to verification.
7. **Do not** store **plain** verification token in DB in NEW (keep hashed + expiry).
8. **Do not** change **password reset** flow when adding verification (they stay separate).

---

## PHASE 1 — Minimal migration design (STILL NO CODING)

- **One verification method for Phase 1:** Link-based email verification (recommended); NEW already has it. OTP not in legacy in a clean, reusable form.
- **Implementation:** See sections C, D, E above. Env mapping Laravel → Node (same names); template content copied into a small Node template; token/expiry already implemented in NEW; new code: mailer adapter + wiring in `sendVerificationEmail()`, plus publish gating behind flag.
- **Gating policy (Phase 1):** Do not gate login or /create Save. Gate only “Publish store” (or “Make public”) when `ENABLE_EMAIL_VERIFICATION=1` and user not verified.

---

## PHASE 2 — Implement (coding allowed only after risk warning)

- After this audit and plan are agreed, implement:
  - Node mailer adapter (nodemailer SMTP using env vars above).
  - Tests with **mocked** email send (no real sending in CI).
- Before merging any change: run existing auth and store-publish tests; confirm no regression in store creation → publish → frontscreen.

---

**Document version:** 1.0  
**Date:** 2025-02-15
