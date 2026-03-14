# Email verification – how to continue

When you click **Publish to live** and see the **"Verify your email"** modal, you can proceed in one of two ways.

---

## Option 1: Verify your email (recommended for production)

1. **Send verification email**  
   In the modal, click **"Send verification email"**.  
   - The app calls `POST /api/auth/verify/request`.  
   - You must have [SMTP configured](EMAIL_VERIFICATION_SETUP.md) (e.g. Mailtrap for dev) or the email will not be sent (backend may log a stub link).

2. **Open the link**  
   Check the inbox for the account you’re signed in with. Click the verification link in the email.

3. **Refresh and publish**  
   Back in the app, click **"I've verified — Refresh"** in the same modal.  
   The app refetches your user (now `emailVerified: true`) and then retries publish. You can also close the modal and click **Publish to live** again.

**If no email arrives:** see [EMAIL_VERIFICATION_SETUP.md](EMAIL_VERIFICATION_SETUP.md) (SMTP, Mailtrap, and troubleshooting).

---

## Option 2: Dev bypass (skip verification for local testing)

If you only need to test publishing and don’t care about verification locally:

### A. Disable the verification gate

In the **core** env (e.g. `apps/core/cardbey-core/.env` or root `.env` used by the core):

```env
ENABLE_EMAIL_VERIFICATION=false
```

Restart the **core** server. The backend will no longer require email verification for publish, and the frontend will not show the verification modal when the backend does not require it.

### B. Allow unverified publish (gate on, but allow bypass)

Keep verification **on** but allow unverified users to publish (e.g. to test the full flow without email):

In the **core** env:

```env
ENABLE_EMAIL_VERIFICATION=true
CARD_BEY_ALLOW_UNVERIFIED_PUBLISH=true
```

Restart the **core** server. The backend will allow publish even when `emailVerified` is false. If the **GET /api/auth/me** response includes `allowUnverifiedPublish: true` when this env is set, the modal will show a **"Publish anyway (verify later)"** button; otherwise you can still get a 403 on publish—in that case use Option 2A (disable the gate) for local testing.

---

## Summary

| Goal                         | Action |
|-----------------------------|--------|
| Actually verify and publish | Use Option 1 (send email → click link → "I've verified — Refresh"). |
| Test publish without email  | Use Option 2A: `ENABLE_EMAIL_VERIFICATION=false` and restart core. |
