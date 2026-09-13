# IMPACT REPORT — Fix dev-user-id leak into mission/store context

**Date:** 2026-09-11  
**Status:** Fix userId propagation for `dev-admin-token` only

## Root cause

`assistantAuth` (`guestAuth.js`) hardcodes `req.user.id = 'dev-user-id'` when Bearer is `dev-admin-token` (JWT verify catch path). Performer intake uses `assistantAuth`, so missions get `createdBy: 'dev-user-id'` even when `.env` has `DEV_USER_ID=cmrg3grrp001sjvkc79bxhyb1`.

`requireAuth` in `auth.js` already uses `DEV_USER_ID`; `optionalAuth` uses a different hardcoded `dev-admin`.

## What could break

| Risk | Mitigation |
|------|------------|
| Local setups without DEV_USER_ID | Clear error requiring DEV_USER_ID (non-production) |
| Real JWT path | Unchanged — only `dev-admin-token` branch |
| Code that intentionally matches `dev-user-id` | Leave detection helpers; stop producing that id |

## Smallest safe patch

1. Shared `resolveDevAdminUser()` from `DEV_USER_ID` (required in non-production).
2. Use it in `requireAuth`, `optionalAuth`, and both `assistantAuth` branches.
3. Do not change store/campaign logic.
