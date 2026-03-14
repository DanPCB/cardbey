# Impact Report: Email Verification URL Generation Refactor

**Date:** 2026-03-11  
**Scope:** Email verification link generation only. No change to login, register, confirm handler logic, or password reset.

---

## 1) What could break

- **Verification links in emails could change** if the deploy currently relies on `PUBLIC_BASE_URL` set to a frontend or a URL with a path (e.g. `https://example.com/q/4n0m`). After the change, such values will be rejected and the link will use the fallback (`http://localhost:3001`) or a valid `PUBLIC_API_BASE_URL`.
- **Behavior change:** If someone had intentionally set `PUBLIC_BASE_URL` to a frontend origin (e.g. `http://localhost:5174`) and the frontend proxies `/api` to the backend, the link would currently point to the frontend. After the fix, we prefer API origin; if only `PUBLIC_BASE_URL` was set to the frontend URL, the new guard could treat it as invalid (no path segment check for “5174” — we only reject paths like `/q/`, `/go/`). So links would only change if the base URL contained `/q/` or `/go/`, or if we add a strict “origin-only” rule. The minimal approach is: **only reject bases containing temporary path segments** (`/q/`, `/go/`), and **prefer `PUBLIC_API_BASE_URL`** so that setting the API base explicitly is the recommended approach.

---

## 2) Why

- Verification links must point to the **API** (Core) because `GET /api/auth/verify/confirm` is served by the backend. Using a frontend base (e.g. port 5174) or a base with a path (e.g. `/q/4n0m`) can produce dead or wrong links.
- Current code uses `PUBLIC_API_BASE_URL || PUBLIC_BASE_URL || 'http://localhost:3001'` with no validation, so misconfiguration (e.g. `PUBLIC_BASE_URL` set to frontend or a short-link URL) produces broken verification emails.

---

## 3) Impact scope

- **Affected:** Only the **verification email link** built in `sendVerificationEmail()` in `apps/core/cardbey-core/src/routes/auth.js`. Used by: POST `/api/auth/verify/request`, POST `/api/auth/request-verification`, and (when verification is enabled) POST `/api/auth/register`.
- **Not affected:** Login, register, JWT, confirm handler (GET `/api/auth/verify/confirm`), GET `/api/auth/verify`, redirect after confirm (FRONTEND_URL / PUBLIC_WEB_BASE_URL), password reset link, or any other auth logic.

---

## 4) Smallest safe patch

- Add a helper `getVerificationLinkBaseUrl()` that:
  - Reads `PUBLIC_API_BASE_URL` then `PUBLIC_BASE_URL`.
  - Normalizes: trim, remove trailing slash.
  - Rejects bases containing temporary path segments (e.g. `/q/`, `/go/`).
  - Returns fallback `http://localhost:3001` when unset or invalid.
- Use this helper in `sendVerificationEmail()` to build the confirm URL. Keep confirm path and query shape unchanged: `/api/auth/verify/confirm?token=...&redirect_uri=...`.
- Do not change redirect-after-confirm logic or any other routes.

---

**Outcome:** Verification links will always be built from a canonical API origin (or safe fallback), with no accidental use of temporary dev paths or frontend-only origins unless explicitly and correctly configured.
