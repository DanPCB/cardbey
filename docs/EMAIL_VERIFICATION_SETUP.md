# Email verification setup

Verification emails are sent when **both** of these are true:

1. **`ENABLE_EMAIL_VERIFICATION`** is `true` or `1`
2. **`MAIL_HOST`** is set (SMTP is configured)

Without these, the app still creates accounts and shows the “We’ve sent a verification email” screen, but no email is sent (in development you may see a stub log with the link).

---

## 1. Enable the feature

In the environment used by **cardbey-core** (e.g. root `.env` or `apps/core/cardbey-core/.env`):

```env
ENABLE_EMAIL_VERIFICATION=true
```

---

## 2. Configure SMTP

Set at least:

| Variable         | Required | Description |
|------------------|----------|-------------|
| `MAIL_HOST`      | Yes      | SMTP host (e.g. `smtp.mailtrap.io`, `smtp.gmail.com`) |
| `MAIL_PORT`      | No       | Default `587` |
| `MAIL_USER`      | If auth  | SMTP username |
| `MAIL_PASS`      | If auth  | SMTP password |
| `MAIL_FROM_EMAIL`| No       | Default `no-reply@cardbey.com` |
| `MAIL_FROM_NAME` | No       | Default `Cardbey` |
| `MAIL_SECURE`    | No       | Set `true` for port 465 |
| `MAIL_INSECURE_TLS` | No    | Set `true` only if you get "Hostname/IP does not match certificate's altnames". **Insecure:** disables TLS certificate hostname verification. Use only when the server is trusted (e.g. shared hosting with wrong cert). Prefer fixing the cert or using the hostname that matches the cert. |

Optional but recommended so the link works when the user clicks it:

| Variable              | Description |
|-----------------------|-------------|
| `PUBLIC_API_BASE_URL` | Base URL of the API (e.g. `http://localhost:3001`). Used to build the verification link. |

---

## 3. Test inbox (Mailtrap)

For local/testing, use [Mailtrap](https://mailtrap.io) so messages don’t go to real inboxes:

1. Sign up at https://mailtrap.io
2. Create an inbox → **SMTP Settings** (or **Integrations** → SMTP).
3. Copy host, port, user, and password into your `.env`:

```env
ENABLE_EMAIL_VERIFICATION=true
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your_mailtrap_user
MAIL_PASS=your_mailtrap_password
MAIL_FROM_EMAIL=no-reply@cardbey.com
MAIL_FROM_NAME=Cardbey
PUBLIC_API_BASE_URL=http://localhost:3001
```

4. Restart the **core** server so it picks up the new env.
5. Register a new account (or use “Send verification email” from the publish modal). The message should appear in your Mailtrap inbox; click the link to verify.

---

## 4. When emails are sent

- **On signup:** If `ENABLE_EMAIL_VERIFICATION` and `MAIL_HOST` are set, one verification email is sent right after registration (so the “Welcome – we’ve sent a verification email” screen is accurate).
- **On demand:** From the “Verify your email” modal (e.g. before publish), **Send verification email** calls `POST /api/auth/verify/request` and sends one email (rate-limited).

---

## 5. Troubleshooting

- **No email in Mailtrap:** Check core server logs for `[Auth] Verification email sent` or `[Mailer] Sent`. If you see `[Mailer] Skipped` or `Verification email (stub)`, env is not loaded or `MAIL_HOST` / `ENABLE_EMAIL_VERIFICATION` are missing.
- **Link points to wrong URL:** Set `PUBLIC_API_BASE_URL` (and, if needed, `PUBLIC_BASE_URL`) to the URL your frontend and API use (e.g. `https://api.yourapp.com` in production).
- **Real SMTP (Gmail, SendGrid, etc.):** Use your provider’s host/port/auth and, for Gmail, an [App Password](https://support.google.com/accounts/answer/185833) if 2FA is on.
- **"Hostname/IP does not match certificate's altnames":** The server at `MAIL_HOST` is using an SSL cert that does not list that hostname. Use the SMTP host your provider gives you (or Mailtrap/SendGrid), or install a cert that includes `MAIL_HOST`. As a last resort only: set `MAIL_INSECURE_TLS=true` to skip TLS hostname verification (insecure).
