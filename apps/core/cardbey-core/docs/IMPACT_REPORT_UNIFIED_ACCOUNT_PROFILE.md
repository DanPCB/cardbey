# Impact Report: Unified Account Profile + User Account Management

## What could break

1. **Creator onboarding** — if identity reads switch to User-only without fallbacks, existing Creator-only avatars/names may disappear on profile surfaces.
2. **Public URLs** — `/u/:handle` vs `/creator/:username` must both keep working; merging slugs without redirects breaks bookmarks.
3. **Account Management nav** — renaming `/control-center/account-management` without redirect confuses admins using duplicate-store hygiene tools.
4. **Creator Studio gate** — changing activation flow from `/creator-studio` direct onboarding to `/profile?activate=creator` may break deep links.
5. **Space switcher** — adding Creator context incorrectly could navigate away from active business missions.

## Why

- Introducing `AccountProfile` + capability model changes how capabilities are inferred and restricted.
- Admin User Accounts writes go through new governed actions; miswired permissions could block legitimate admin ops.
- Identity resolver centralizes reads; any bug affects dashboard account, public profile, and creator surfaces simultaneously.

## Impact scope

- Auth/User (`User` model reads, `/api/auth/me`, profile PATCH)
- Creator (`Creator` extension, onboarding, studio gate)
- Business spaces (owned stores list on profile hub)
- Control Center (new `/control-center/user-accounts`, nav rename for hygiene section)
- Space switcher, Creators CTA, `/profile` route

## Smallest safe patch (this implementation)

1. Add `AccountProfile` (1:1 User) for **capabilities + accountStatus** only — do **not** move identity columns yet.
2. Add `UserAccountEvent` append-only audit log.
3. Central **identity resolver** with User → Creator fallback reads (no duplicate writes).
4. Compute capabilities from existing relations; persist overrides on `AccountProfile`.
5. New admin **User Accounts** section; keep existing account-management as **Platform Hygiene** with redirect alias.
6. `/profile` authenticated hub; Creators CTA routes to capability activation on same User.
7. Prefill creator onboarding from User; do not create second User on creator activate.

## Not in this phase

- Deleting Creator identity columns
- Merging `handle` and `username`
- Full session revoke / deletion workflow execution
- LLM or automated capability assignment
