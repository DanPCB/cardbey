# Password Recovery – Manual Test Checklist

## Overview

- **Forgot password:** Login page → "Forgot password?" → `/forgot-password` → submit email → generic success message.
- **Reset:** Email link → `/reset?token=...` → set new password (min 8 chars) → submit → redirect to dashboard (auto-login) or login.
- **Backend:** `POST /api/auth/request-reset` (rate limited), `POST /api/auth/reset` (validates token, min password 8).

## Env for sending reset emails

Same as existing mailer. Ensure at least one of:

- `MAIL_HOST` (and `MAIL_USER` / `MAIL_PASS` if needed), or
- Resend/Postmark/SMTP configured in `apps/core/cardbey-core/src/services/email/mailer.js`.

Reset link base URL (for links in the email):

- `PUBLIC_WEB_BASE_URL` or `FRONTEND_URL` or `PUBLIC_BASE_URL` (default `http://localhost:5174`).

## Manual tests

### Happy path

1. Open login page → click "Forgot password?" → should go to `/forgot-password`.
2. Enter an email that exists in the DB. Submit.
3. Expect generic success message (no indication whether email exists). Check inbox (or mail catcher) for reset email; link should point to `{base}/reset?token=...`.
4. Open the link (or copy `/reset?token=...` with the token from the email). Set new password (e.g. 8+ chars) and confirm. Submit.
5. Expect redirect to dashboard and to be logged in (or redirect to login with success message, depending on backend response).

### Expired token

1. Use a token that has expired (or manually set `passwordResetExpiresAt` in the past for a user’s reset token).
2. Open `/reset?token=...` with that token. Set new password and submit.
3. Expect error (e.g. "Invalid or expired link") and no password change. User can use "Forgot password?" again to get a new link.

### Invalid / wrong token

1. Open `/reset?token=invalid_or_wrong_token`. Set new password and submit.
2. Expect error (invalid/expired). No user’s password should change.

### Invalid email (request reset)

1. On `/forgot-password`, enter an email that does **not** exist in the DB. Submit.
2. Expect the **same** generic success message as for an existing email (no user enumeration). No email sent.

### Rate limit (request reset)

1. From one IP, call `POST /api/auth/request-reset` repeatedly with any body (e.g. `{ "email": "a@b.com" }`) many times in a short window (e.g. 6+ times within 15 minutes).
2. Expect 429 with a message about rate limit. Before that, each request returns 200 with the generic success JSON.

### Password rules

1. On reset page, submit a password shorter than 8 characters. Expect validation error (client or server).
2. Submit with 8+ characters and matching confirm. Expect success.

## Routes (dashboard)

- `/forgot-password` → ForgotPasswordPage
- `/reset` → ResetPasswordPage (reads `?token=` from URL)

## Backend endpoints

| Method | Path | Purpose |
|--------|------|--------|
| POST | `/api/auth/request-reset` | Body: `{ email }`. Sends reset email if user exists; always same generic success. Rate limited. |
| POST | `/api/auth/reset` | Body: `{ token, password }`. Validates token server-side; min password length 8. On success can return `token` for auto-login. |

## Security notes

- Token is validated server-side; password rules enforced server-side (min length 8).
- Request-reset response is generic to avoid user enumeration.
- Rate limiting is per-IP (and can be per-email in implementation). CSRF: same patterns as rest of app (e.g. no cookie-based auth for these actions if using Bearer-only API).
