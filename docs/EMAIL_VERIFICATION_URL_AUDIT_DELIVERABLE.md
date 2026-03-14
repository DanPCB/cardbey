# Email Verification URL Audit — Deliverable

**Date:** 2026-03-11

---

## 1. Root cause

- **Single code path** builds the verification link: `sendVerificationEmail()` in `apps/core/cardbey-core/src/routes/auth.js`. It used `PUBLIC_API_BASE_URL || PUBLIC_BASE_URL || 'http://localhost:3001'` with **no validation**.
- **Problems:**
  - `PUBLIC_BASE_URL` is ambiguous: it is used elsewhere for frontend/dashboard (e.g. QR, redirects). If set to the frontend origin (e.g. `http://localhost:5174`) or to a URL with a temporary path (e.g. `https://example.com/q/4n0m`), the verification link in the email pointed to the wrong place. The confirm endpoint is **API** (`GET /api/auth/verify/confirm`), so the link must use the **API origin**.
  - No guard against temporary/dev path segments (e.g. `/q/`, `/go/`) or trailing slashes, so misconfiguration produced broken or dead links.

---

## 2. Code paths that generate account verification links

| Location | Purpose |
|----------|---------|
| `apps/core/cardbey-core/src/routes/auth.js` → `sendVerificationEmail()` | Builds the full verification link and passes it to `getVerifyEmailContent()` and `sendMail()`. |
| Called from: (1) `handleRequestVerification()` (POST `/api/auth/verify/request`, POST `/api/auth/request-verification`), (2) POST `/api/auth/register` when `ENABLE_EMAIL_VERIFICATION` is on. | No other code paths build verification links. |

**Confirm URL shape (unchanged):**  
`${base}/${confirmPath}?${query}` → `${base}/api/auth/verify/confirm?token=...&redirect_uri=/onboarding/business?verified=1`

---

## 3. Env vars used (before vs after)

| Env var | Used for | Before | After |
|---------|----------|--------|--------|
| `PUBLIC_API_BASE_URL` | Verification **link** base (API origin) | First choice | First choice (unchanged) |
| `PUBLIC_BASE_URL` | Fallback for link base | Second choice, no validation | Second choice; **rejected** if it contains `/q/` or `/go/` |
| (none) | Fallback when both unset/invalid | `http://localhost:3001` | Same |
| `PUBLIC_WEB_BASE_URL` / `FRONTEND_URL` / `PUBLIC_BASE_URL` | **Redirect after confirm** (frontend) | Used in GET `/api/auth/verify/confirm` only for redirect | **Not changed** (redirect logic untouched) |

---

## 4. Generated link: frontend vs API origin

- **Correct:** Link must point to the **API** (Core), e.g. `https://api.example.com/api/auth/verify/confirm?token=...` or `http://localhost:3001/api/auth/verify/confirm?token=...`.
- **Incorrect:** Using frontend origin (e.g. port 5174) or a base with path (e.g. `/q/4n0m`) unless that is actually the public API origin. The refactor ensures the link is built from a **canonical API origin** and rejects bases containing `/q/` or `/go/`.

---

## 5. Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/auth.js` | Added `getVerificationLinkBaseUrl()` and use it in `sendVerificationEmail()`. |
| `docs/IMPACT_REPORT_EMAIL_VERIFICATION_URL.md` | Impact report (pre-change). |
| `docs/EMAIL_VERIFICATION_URL_AUDIT_DELIVERABLE.md` | This deliverable. |

---

## 6. Exact code patch (minimal diff)

**File:** `apps/core/cardbey-core/src/routes/auth.js`

```diff
 const VERIFICATION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

+/** Default API origin for verification links when env is unset or invalid */
+const VERIFICATION_LINK_FALLBACK_ORIGIN = 'http://localhost:3001';
+
+/** Temporary path segments that must not appear in verification link base (e.g. short-link or dev paths) */
+const INVALID_BASE_PATH_PATTERNS = ['/q/', '/go/'];
+
+/**
+ * Canonical base URL for email verification links. Must be the API origin (no frontend or short-link URLs).
+ * Normalizes trailing slashes and rejects bases containing temporary path segments like /q/ or /go/.
+ * @returns {string} Origin with no trailing slash (e.g. https://api.example.com or http://localhost:3001)
+ */
+function getVerificationLinkBaseUrl() {
+  const raw = (process.env.PUBLIC_API_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
+  if (!raw) return VERIFICATION_LINK_FALLBACK_ORIGIN;
+  const hasInvalidPath = INVALID_BASE_PATH_PATTERNS.some((p) => raw.includes(p));
+  if (hasInvalidPath) {
+    if (process.env.NODE_ENV !== 'production') {
+      console.warn('[Auth] Verification link base URL rejected (contains temporary path segment like /q/ or /go/)', { value: raw });
+    }
+    return VERIFICATION_LINK_FALLBACK_ORIGIN;
+  }
+  return raw;
+}
+
 /**
  * Send verification email. When ENABLE_EMAIL_VERIFICATION=true and MAIL_HOST set, sends via mailer.
  * Otherwise logs and skips (no throw). Never logs raw token in production.
  */
 function sendVerificationEmail({ to, rawToken, displayName }) {
-  const apiBase = process.env.PUBLIC_API_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
+  const apiBase = getVerificationLinkBaseUrl();
   const redirectUri = '/onboarding/business?verified=1';
   const confirmPath = '/api/auth/verify/confirm';
   const query = new URLSearchParams({
     token: rawToken,
     redirect_uri: redirectUri
   });
-  const fullLink = `${apiBase.replace(/\/$/, '')}${confirmPath}?${query.toString()}`;
+  const fullLink = `${apiBase}${confirmPath}?${query.toString()}`;
```

---

## 7. Env variable recommendation

| Environment | Verification link base (API origin) | Redirect after confirm (frontend) |
|-------------|--------------------------------------|------------------------------------|
| **Local dev** | `PUBLIC_API_BASE_URL=http://localhost:3001` (or omit → fallback 3001) | `PUBLIC_WEB_BASE_URL` or `FRONTEND_URL=http://localhost:5174` for redirect after confirm |
| **Staging** | `PUBLIC_API_BASE_URL=https://api.staging.example.com` | `PUBLIC_WEB_BASE_URL=https://app.staging.example.com` (or FRONTEND_URL) |
| **Production** | `PUBLIC_API_BASE_URL=https://api.example.com` | `PUBLIC_WEB_BASE_URL=https://app.example.com` (or FRONTEND_URL) |

- **Recommendation:** Set **`PUBLIC_API_BASE_URL`** to the **public API origin** (no path). Do not use `PUBLIC_BASE_URL` for the verification link if it points at the frontend or at a path like `/q/...`. Redirect-after-confirm continues to use `PUBLIC_WEB_BASE_URL` / `FRONTEND_URL` / `PUBLIC_BASE_URL` in the confirm handler; that is unchanged.

---

## 8. Manual verification checklist

- [ ] **Local dev:** Set `PUBLIC_API_BASE_URL=http://localhost:3001` (or leave unset). Request verification email; open stub log or real email. Link should be `http://localhost:3001/api/auth/verify/confirm?token=...&redirect_uri=...`. Click link → confirm returns 302 to frontend or JSON; user marked verified.
- [ ] **Invalid base:** Set `PUBLIC_BASE_URL=http://localhost:5174/q/4n0m`. Request verification again. Link in log/email should be `http://localhost:3001/api/auth/verify/confirm?token=...` (fallback), and in non-production a console.warn should mention rejected base.
- [ ] **Trailing slash:** Set `PUBLIC_API_BASE_URL=http://localhost:3001/`. Link should be `http://localhost:3001/api/auth/verify/confirm?token=...` (no double slash).
- [ ] **Staging/Prod:** Set `PUBLIC_API_BASE_URL` to real API origin. Send verification email; confirm link in email points to API; clicking verifies and redirects to frontend if `redirect_uri` and frontend base are set.
- [ ] **Existing tests:** Run `auth.verification.test.js` (e.g. `npm run test` in core); no failures.
