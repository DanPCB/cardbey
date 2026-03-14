# Email Verification Abuse Hardening

## A. Files involved

| File | Role |
|------|------|
| `apps/core/cardbey-core/src/routes/auth.js` | Cooldown store, 60s check, token reuse, handleRequestVerification; findUserByVerificationTokenHash; verify/confirm and GET /verify with atomic consume and stable codes; rate limiter wiring |
| `apps/core/cardbey-core/src/middleware/rateLimit.js` | Optional `code` in 429 response (e.g. `RATE_LIMITED`) |

No frontend changes required; 200 with `alreadySent: true` is treated as success; 429 with `code: 'RATE_LIMITED'` is already handled by the modal (toast + retryAfter).

---

## B. Current risks (before hardening)

- **Resend spam:** No per-user cooldown; user could hit “Send verification email” repeatedly and trigger many SMTP sends in a short time.
- **Token churn:** Every request minted a new token and overwrote the previous one; no reuse of an existing valid token.
- **IP abuse:** Only per-user limit (3/10 min); shared IPs could exceed intended load (e.g. 3 users × 3 = 9 requests in 10 min from one IP).
- **Confirm race:** Two concurrent requests with the same token could both pass validation and both update the user (double-consume).
- **Unstable errors:** Confirm/verify returned generic “Invalid or expired token” / “Email already verified” without machine-readable codes for clients.

---

## C. Exact code changes

### 1. Rate limiting (auth.js)

- **Per-user:** Window 10 min → **15 min**, max **3**; key `verify-req-user:${userId}`; response **code: 'RATE_LIMITED'**.
- **Per-IP (new):** **10** requests per **60** minutes; key `verify-req-ip:${req.ip}`; **code: 'RATE_LIMITED'**.
- **Cooldown (new):** In-memory `lastVerificationSendByUser` Map; after a successful send, store `lastVerificationSendByUser.set(user.id, Date.now())`. At start of handler (after auth + config), if `(now - lastSend) < 60_000` return **429** with **code: 'RATE_LIMITED'**, **Retry-After**, and message to wait.

### 2. rateLimit.js

- **Optional `code`:** `rateLimit({ ..., code: responseCode = 'rate_limit_exceeded' })`; 429 body includes **`code: responseCode`** (e.g. `RATE_LIMITED`). Existing callers unchanged (default `rate_limit_exceeded`).

### 3. One active token + reuse (auth.js)

- Before creating a new token, **load user** from DB with `verificationToken`, `verificationExpires`.
- If **verificationToken** and **verificationExpires** are set and **verificationExpires > now**: do **not** create a new token or send email; return **200** `{ ok: true, alreadySent: true }` and log **verify/request token reused**.
- Otherwise: create new token, update DB, send email, record cooldown. Token expiry remains **30 minutes** (VERIFICATION_EXPIRY_MS unchanged).

### 4. Confirm + GET /verify: stable codes and atomic consume (auth.js)

- **findUserByVerificationTokenHash(hashed):** New helper; finds user by `verificationToken: hashed` only (any expiry).
- **Confirm and GET /verify:**
  - Hash token; look up user by hash.
  - If no user → **400** **code: 'TOKEN_INVALID'**, message “This verification token is invalid…”
  - If user.verificationExpires null or ≤ now → **400** **code: 'TOKEN_EXPIRED'**, message “This verification token has expired…”
  - If user.emailVerified → **400** **code: 'TOKEN_ALREADY_USED'**, message “This email is already verified.”
  - Else: **updateMany** with `where: { id, verificationToken: hashed, verificationExpires: { gt: now }, emailVerified: false }`, set `emailVerified: true`, `verificationToken: null`, `verificationExpires: null`.
  - If **result.count === 0** → **400** **code: 'TOKEN_ALREADY_USED'** (race).
  - Else success; log **verify/confirm success** (or equivalent for GET /verify).

### 5. Structured logs (no secrets/tokens)

- **verify/request:** request received, user resolved, config validation, **rate limited (cooldown)**, **token reused**, token created, provider send success.
- **verify/confirm:** **invalid** (reason), **expired** (userId), **already used** (userId), **already used (race)**, **success** (userId).

---

## D. Risks / edge cases

- **In-memory cooldown/store:** Resets on server restart. Acceptable for 60s cooldown; per-user and per-IP limits also in-memory (existing behavior).
- **Reuse = no resend:** When a valid token already exists, we return 200 `alreadySent: true` and do **not** send another email. User must wait for token to expire (30 min) to get a new link, or use the existing link. Reduces SMTP load; “Resend” within 30 min does not send again (only after 60s cooldown and no valid token, or after token expiry and new request).
- **Auth/publish/store creation:** Only verification request and confirm/verify endpoints are changed. Login, register, publish, store creation unchanged. **No intended impact** on those flows.
- **Frontend:** 200 with `alreadySent: true` still shows success toast (“Verification email sent. Check your inbox.”). Optional improvement: show “A verification email was already sent. Check your inbox.” when `body.alreadySent === true`.

---

## E. Manual verification checklist

1. **60s cooldown:** As an authenticated user, request verification twice within 60s. Second request → **429** with **code: 'RATE_LIMITED'** and **Retry-After**; log “verify/request rate limited (cooldown)”.
2. **3 per 15 min per user:** As same user, send 4 requests (each after 60s cooldown). Fourth request within 15 min → **429** **RATE_LIMITED** (per-user limit).
3. **10 per hour per IP:** From one IP, 11 different users (or 11 requests after cooldown from one user) within an hour → 11th request **429** **RATE_LIMITED** (per-IP).
4. **Token reuse:** Request verification; get 200. Within 30 min (and after 60s cooldown), request again. Expect **200** `{ ok: true, alreadySent: true }`, no new email; log “verify/request token reused”.
5. **Confirm – TOKEN_INVALID:** GET /verify/confirm?token=invalid → **400** **code: 'TOKEN_INVALID'**.
6. **Confirm – TOKEN_EXPIRED:** Use an expired token → **400** **code: 'TOKEN_EXPIRED'**.
7. **Confirm – TOKEN_ALREADY_USED:** Confirm once, then hit same link again → **400** **code: 'TOKEN_ALREADY_USED'**.
8. **Confirm – success:** Valid token, first use → **302** or **200** `{ ok: true, verified: true }`; log “verify/confirm success”.
9. **Atomic consume:** Two concurrent GETs with same token → one success, one **400** **TOKEN_ALREADY_USED** (or race path).

---

## F. Commit message

```
fix(auth): harden email verification against abuse

- 60s cooldown per user between successful sends; 3/15min per user, 10/hour per IP
- One active unconsumed token per user; reuse valid token (return 200 alreadySent, no new email)
- Confirm/verify: atomic updateMany consume; stable codes TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_ALREADY_USED
- 429 response includes code RATE_LIMITED; structured logs (no secrets/tokens)
- Token expiry 30 min unchanged
```
