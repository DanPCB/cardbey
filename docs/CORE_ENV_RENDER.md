# Cardbey Core — Render Environment Variables

## Guest Auth (Soft guest: 1 draft, then sign-in)

| Variable | Value | Description |
|----------|-------|-------------|
| `GUEST_AUTH_ENABLED` | `true` | Enable guest auth (primary). |
| `ALLOW_GUEST_AUTH` | `true` | Legacy alias; either enables guest. If both unset in production, `POST /api/auth/guest` returns `410 guest_disabled`. |
| `GUEST_MAX_DRAFTS` | `1` | Max draft generations per guest (default 1). Second attempt returns 403 `guest_limit_reached`. |
| `GUEST_RATE_LIMIT_PER_MIN` | `5` | Rate limit for `POST /api/auth/guest` (per IP). |
| `GUEST_RATE_LIMIT_DRAFT_PER_MIN` | `2` | Rate limit for draft start (`POST /api/mi/orchestra/start`) per IP. |

**Where checked:** `apps/core/cardbey-core/src/routes/auth.js`, `src/routes/miRoutes.js`

**To enable on Render:** Add `GUEST_AUTH_ENABLED=true` (or `ALLOW_GUEST_AUTH=true`) to the cardbey-core service environment variables.
