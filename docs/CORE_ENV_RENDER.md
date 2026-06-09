# Cardbey Core — Render Environment Variables

## Guest Auth (Soft guest: 1 draft, then sign-in)

**`GUEST_MAX_DRAFTS` alone does not enable guest auth.** You must also enable issuance on the **cardbey-core** service (not the dashboard).

| Variable | Value | Description |
|----------|-------|-------------|
| `GUEST_AUTH_ENABLED` | `true` | **Required on staging** unless auto-detect applies (see below). Enables `POST /api/auth/guest`. |
| `ALLOW_GUEST_AUTH` | `true` | Legacy alias of `GUEST_AUTH_ENABLED`. |
| `CARDBEY_ENV` | `staging` | Auto-enables guest auth when `NODE_ENV=production` (alternative to `GUEST_AUTH_ENABLED`). |
| `GUEST_MAX_DRAFTS` | `1` | Max completed draft generations per guest per 24h (default 1). Does **not** enable guest login. |
| `GUEST_RATE_LIMIT_PER_MIN` | `5` | Rate limit for `POST /api/auth/guest` (per IP). |
| `GUEST_RATE_LIMIT_DRAFT_PER_MIN` | `2` | Rate limit for draft start (`POST /api/mi/orchestra/start`) per IP. |

**Where checked:** `apps/core/cardbey-core/src/routes/auth.js`, `src/routes/miRoutes.js`

**To enable on Render (cardbey-core):** Add `GUEST_AUTH_ENABLED=true`.  
Auto-detect (no extra var) only if the core service name contains `staging` (`RENDER_SERVICE_NAME`) or `CARDBEY_ENV=staging` — if unsure, set `GUEST_AUTH_ENABLED=true` explicitly.
