# Verification Resend: Reuse Token and Send Email Again

## A. Exact code changes

### 1. Schema (one active token + raw for resend)

- **prisma/schema.prisma** and **prisma/sqlite/schema.prisma**  
  - On `User`, add:  
    `verificationTokenRaw String? // Raw token for resend only; cleared on confirm. Not exposed in API.`  
  - After deploy, run `npx prisma db push` (or your usual migration) so the column exists.

### 2. Request handler (auth.js)

- **When a valid unexpired token already exists and `verificationTokenRaw` is set:**
  - Reuse that raw token (do not mint a new one).
  - Log: `[Auth] verify/request token reused, resend attempt` with `userId`.
  - Call `sendVerificationEmail({ to, rawToken, displayName })` and await.
  - If send fails: log `[Auth] verify/request resend failed` with `userId`, `code`, `error`; return **503** with `code: sendResult.code || 'EMAIL_SEND_FAILED'` and `message: sendResult.error || '...'`.
  - If send succeeds: log `[Auth] verify/request resend success` with `userId`; set cooldown `lastVerificationSendByUser.set(user.id, Date.now())`; return **200** with `{ ok: true, resent: true, reusedToken: true }`.

- **When creating a new token:**
  - In `prisma.user.update` (verify/request and register), set `verificationTokenRaw: rawToken` along with `verificationToken` and `verificationExpires`.

- **When consuming the token (confirm and GET /verify):**
  - In the `updateMany` that sets `emailVerified: true` and clears the token, also set `verificationTokenRaw: null`.

### 3. Register flow (auth.js)

- In the `prisma.user.update` that sets `verificationToken` and `verificationExpires` after register, add `verificationTokenRaw: rawToken` so a later resend can use the same link.

### 4. Backward compatibility

- If there is a valid token but `verificationTokenRaw` is missing (e.g. existing row before this change), the handler does not take the “reuse” path and falls through to “create new token” and send, so the user still gets an email and future resends will have a stored raw token.

---

## B. Risk assessment

**Could this break store creation / auth / publish?**

- **No.**
  - Only verification request and confirm/verify flows are changed.
  - **Store creation / publish:** Unchanged.
  - **Auth (login, register, confirm):** Register still returns 201 and sends one verification email; it now also stores `verificationTokenRaw` so resend can reuse the same link. Confirm and GET /verify still consume the token and now also clear `verificationTokenRaw`. No change to login or to “one active token” semantics.
  - **Rate limits and cooldown:** Unchanged; resend is still subject to 60s cooldown and 3/15min per user, 10/hour per IP.
  - **Security:** Raw token is stored only for resend, cleared on confirm, and never returned in API responses. Token still expires in 30 minutes.

**Risks:**

- **New column:** Requires schema deploy and `db push` (or equivalent) so `verificationTokenRaw` exists. Existing rows will have `null`; they get a new token on next request and then can resend.
- **Legacy rows:** Users who had a valid token before the change have no stored raw token; the first “resend” request mints a new token and sends (and stores raw for next time). No error, no broken flow.

---

## C. Manual verification checklist

1. **New user, first request**  
   - POST /api/auth/verify/request with valid Bearer.  
   - Expect 200 and body without `resent`/`reusedToken` (e.g. `{ ok: true }`).  
   - One email sent; DB has `verificationToken`, `verificationTokenRaw`, `verificationExpires` set.

2. **Resend with valid token (same link)**  
   - Wait 60s (cooldown).  
   - POST /api/auth/verify/request again with same user.  
   - Expect 200 `{ ok: true, resent: true, reusedToken: true }`.  
   - Second email received with the **same** verification link.  
   - Logs: `token reused, resend attempt` and `resend success`.

3. **Resend when send fails**  
   - With valid token and cooldown passed, temporarily break mail (e.g. wrong MAIL_PASS).  
   - POST /api/auth/verify/request.  
   - Expect 503 with `code: 'EMAIL_SEND_FAILED'`.  
   - Log: `resend failed` with code/error.

4. **Confirm clears raw token**  
   - After clicking the verification link, confirm DB: `verificationToken`, `verificationTokenRaw`, `verificationExpires` are all null for that user.

5. **Rate limit and cooldown unchanged**  
   - Two requests within 60s: second returns 429 RATE_LIMITED.  
   - Fourth request within 15 min (same user): 429 RATE_LIMITED.

6. **Legacy row (valid token, no raw)**  
   - User with `verificationToken` and `verificationExpires` set but `verificationTokenRaw` null: next POST verify/request creates a new token and sends; response 200 without `reusedToken`; subsequent resends use the new token and return `resent: true, reusedToken: true`.

---

## D. Commit message

```
fix(auth): verification resend sends email again when valid token exists

- Store verificationTokenRaw for resend; reuse same token and send email again
  instead of returning alreadySent without sending
- Return 200 { ok: true, resent: true, reusedToken: true } on resend success;
  503 EMAIL_SEND_FAILED if resend fails
- Clear verificationTokenRaw on confirm and in GET /verify
- Add verificationTokenRaw to User in prisma schema(s); register stores raw
  so resend works after signup
- Logs: token reused, resend attempt, resend success/failure
- Rate limits and cooldown unchanged
```
