# Email Verification Sending Flow – Audit and Production Safety Fix

## A. Files involved

| File | Role |
|------|------|
| `apps/core/cardbey-core/src/routes/auth.js` | Route `POST /api/auth/verify/request`, handler `handleRequestVerification`, `sendVerificationEmail`, `getVerificationLinkBaseUrl`, config check, register flow |
| `apps/core/cardbey-core/src/services/email/mailer.js` | `sendMail()` – SMTP via nodemailer; reads MAIL_* env |
| `apps/core/cardbey-core/src/services/email/templates/verifyEmail.js` | `getVerifyEmailContent()` – subject + HTML with verify link |
| `apps/dashboard/cardbey-marketing-dashboard/src/components/verification/VerificationRequiredModal.tsx` | Calls `apiPOST(API.authVerifyRequest)`; shows toast on success/error; uses `e?.body?.message` for error text |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/apiPaths.ts` | `API.authVerifyRequest = '/api/auth/verify/request'` |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | `apiPOST` → `request()` → `throwIfNotOk`; error has `status`, `body`, `message` |

---

## B. Current root cause

1. **Success returned when email is not configured**  
   `sendVerificationEmail` always returned `{ sent: true }` whether or not `ENABLE_EMAIL_VERIFICATION` / `MAIL_HOST` were set. In production with no email env, the handler still responded with `200` and `{ ok: true }`.

2. **Send result ignored**  
   `sendMail()` was invoked with `.then(...)` (fire-and-forget). The handler did not await it and responded with 200 before the provider had finished. Send failures were only logged; the client was not informed.

3. **Provider result not reflected in response**  
   `sendMail` returns `{ ok, skipped?, error? }`. That result was only used in logs; the HTTP response was always success.

4. **Verification link base in production**  
   When `PUBLIC_API_BASE_URL` (or `PUBLIC_BASE_URL`) is unset, `getVerificationLinkBaseUrl()` falls back to `http://localhost:3001`. In production that produces a broken link in the email; the flow now treats “production + fallback base” as not configured and returns 503.

---

## C. Required env vars (from codebase)

Exact names used in code:

| Env var | Used in | Required for |
|---------|--------|---------------|
| `ENABLE_EMAIL_VERIFICATION` | auth.js, mailer.js | Feature on; must be `true` or `1` |
| `MAIL_HOST` | auth.js, mailer.js | SMTP host; non-empty |
| `MAIL_PORT` | mailer.js | Optional; default 587 |
| `MAIL_SECURE` | mailer.js | Optional; `true` for 465 |
| `MAIL_USER` | mailer.js | If SMTP auth required |
| `MAIL_PASS` | mailer.js | If SMTP auth required |
| `MAIL_FROM_EMAIL` | mailer.js | Optional; default `no-reply@cardbey.com` |
| `MAIL_FROM_NAME` | mailer.js | Optional; default `Cardbey` |
| `MAIL_INSECURE_TLS` | mailer.js | Optional; `true` only if TLS hostname check must be disabled |
| `PUBLIC_API_BASE_URL` or `PUBLIC_BASE_URL` | auth.js `getVerificationLinkBaseUrl()` | **Production:** base URL for verification link (API origin). If missing in production, endpoint returns 503 EMAIL_NOT_CONFIGURED. |

Redirect after confirm (not for sending):

- `PUBLIC_WEB_BASE_URL` or `FRONTEND_URL` or `PUBLIC_BASE_URL` – used only in `GET /api/auth/verify/confirm` for redirect target.

---

## D. Exact code changes

### Backend (auth.js)

1. **`getVerificationLinkBaseUrl()`**  
   Now returns `{ base, isFallback }` so callers can detect use of the localhost default.

2. **`isVerificationEmailConfigured()`**  
   New helper: `true` only when `ENABLE_EMAIL_VERIFICATION` and `MAIL_HOST` are set and, in production, the link base is not the fallback.

3. **`sendVerificationEmail()`**  
   - Now `async`, returns `Promise<{ sent, code?, error? }>`.  
   - If not enabled or no MAIL_HOST: `{ sent: false, code: 'EMAIL_NOT_CONFIGURED', error: '...' }`.  
   - If production and base is fallback: `{ sent: false, code: 'EMAIL_NOT_CONFIGURED', error: '...' }`.  
   - Awaits `sendMail()`; on `result.ok` returns `{ sent: true }`; on `result.skipped` or send failure returns `{ sent: false, code: 'EMAIL_NOT_CONFIGURED' | 'EMAIL_SEND_FAILED', error }`.  
   - Never logs raw token.

4. **`handleRequestVerification`**  
   - Structured logs: request received, user resolved, config validation, token created, provider send attempt, provider success/failure.  
   - Early return **503** with `{ ok: false, code: 'EMAIL_NOT_CONFIGURED', message: '...' }` when `!isVerificationEmailConfigured()`.  
   - After DB update, **awaits** `sendVerificationEmail()`.  
   - If `!sendResult.sent`, returns **503** with `{ ok: false, code: sendResult.code || 'EMAIL_SEND_FAILED', message: sendResult.error || '...' }`.  
   - Success response only after provider send succeeded.  
   - No secrets/tokens/stack traces in response body.

5. **Register**  
   Still calls `sendVerificationEmail(...).catch(...)` (fire-and-forget); signup response remains 201 and is not blocked by email send.

### Frontend (VerificationRequiredModal.tsx)

- On non-429 error, toast uses `e?.body?.message ?? e?.message ?? 'Failed to send verification email'` so backend `message` is shown when present.

---

## E. Risks / edge cases

- **Register flow**  
  Register does not await send; 201 is unchanged. If mail is misconfigured, user still gets an account; only the on-demand “Send verification email” (verify/request) returns 503. No change to signup success criteria.

- **Store creation / auth / publish**  
  Only `POST /api/auth/verify/request` (and legacy `POST /api/auth/request-verification`) behavior changed. Login, register, confirm, publish, and store creation are unchanged. **Risk:** In production with no email env, users who click “Send verification email” in the modal now get a 503 and a clear error instead of a false “sent” success. This is the intended correction.

- **Existing clients**  
  Clients that only check `res.ok` or status 200 will now see 503 on misconfiguration or send failure; they should show an error. The modal already treats non-2xx as error and shows a toast; it now shows the backend `message` when provided.

- **Secrets**  
  No tokens or secrets are included in response bodies or in logs (only redacted email e.g. `abc***` in one log line).

---

## F. Manual verification checklist

1. **Production with no email env**  
   - Call `POST /api/auth/verify/request` with valid Bearer.  
   - Expect **503** and body `{ ok: false, code: 'EMAIL_NOT_CONFIGURED', message: '...' }`.  
   - Confirm no 200 when no email was sent.

2. **Production with MAIL_* set but no PUBLIC_API_BASE_URL**  
   - Expect **503** `EMAIL_NOT_CONFIGURED` (link base is fallback in production).

3. **Production with full config**  
   - Call `POST /api/auth/verify/request`.  
   - Expect **200** and `{ ok: true }` only after the provider send succeeds.  
   - Check logs for: verify/request received, user resolved, config validation, token created, provider send success.

4. **Provider send failure (e.g. wrong MAIL_PASS)**  
   - Expect **503** and `{ ok: false, code: 'EMAIL_SEND_FAILED', message: '...' }`.  
   - Check logs for provider send failure (no raw token).

5. **Frontend modal**  
   - With 503, modal should show error toast with backend `message` (e.g. “Email verification is not configured…”).  
   - With 200, “Verification email sent. Check your inbox.”

6. **Register**  
   - Register a new user with verification enabled; expect **201** and account created regardless of email send success.  
   - Optional: check logs for any “Register verification email send failed” if mail is misconfigured.

---

## G. Commit message

```
fix(auth): email verification request – production safety and honest status

- Return 503 EMAIL_NOT_CONFIGURED when ENABLE_EMAIL_VERIFICATION/MAIL_HOST
  or (in production) PUBLIC_API_BASE_URL are missing
- Return 503 EMAIL_SEND_FAILED when provider send fails; only return 200
  after send succeeds
- Await sendVerificationEmail in verify/request handler; add
  isVerificationEmailConfigured() and structured logs (no secrets/tokens)
- Register: keep fire-and-forget send so signup still returns 201
- Frontend: show backend message in verification modal error toast
```

---

## Response shapes (frontend)

**Success (200)**  
```json
{ "ok": true }
```  
Optional in non-production: `"token": "<rawToken>"`.

**Error – not configured (503)**  
```json
{
  "ok": false,
  "code": "EMAIL_NOT_CONFIGURED",
  "message": "Email verification is not configured. Please set ENABLE_EMAIL_VERIFICATION, MAIL_HOST, and in production PUBLIC_API_BASE_URL."
}
```

**Error – send failed (503)**  
```json
{
  "ok": false,
  "code": "EMAIL_SEND_FAILED",
  "message": "Failed to send verification email. Please try again later."
}
```

**Existing errors unchanged**  
- 401: guest or missing auth.  
- 400: email already verified.  
- 429: rate limit (retryAfter in body).

The modal uses `e?.body?.message` for the toast when the server returns JSON with `message`, so the user sees the exact backend message for 503 and other JSON errors.
