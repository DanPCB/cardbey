# Super Admin – Verification Steps

## Summary

- **Role:** `super_admin` (stored in `User.role`; no Prisma migration required).
- **Bootstrap:** `pnpm admin:promote -- --email <email> --role SUPER_ADMIN` (from `apps/core/cardbey-core`).
- **Guards:** Super admin can access draft-store review and run autofill/repair for any store; normal users cannot change their own role.

## Manual Verification

### 1. Promote a user to super_admin

From repo root or `apps/core/cardbey-core`:

```bash
cd apps/core/cardbey-core
pnpm admin:promote -- --email your-internal@example.com --role SUPER_ADMIN
```

Expected: `Updated: your-internal@example.com -> role: super_admin`

### 2. Super admin can access another store’s draft

1. Log in as the super_admin user in the dashboard.
2. Open a draft-store review URL for a store owned by a **different** user (e.g. `/store/:storeId/review` or the draft id for that store).
3. Expected: Page loads; no 403. Super admin can open “Auto-fill missing images” and “Repair wrong images” and they succeed (PATCH /api/draft-store/:draftId and POST repair-catalog return 200).

### 3. Normal user cannot access another store’s draft

1. Log in as a normal user (role `owner`).
2. Open the same draft/store that belongs to another user.
3. Expected: 403 or “You do not have access to this draft/store” where applicable.

### 4. No role escalation from client

1. As a normal user, call PATCH /api/auth/me or profile update with a body that includes `role: "super_admin"` (if the API accepts a body).
2. Expected: Role is not updated; profile update only allows whitelisted fields (no `role`). User’s role in DB remains `owner` (or unchanged).

### 5. Script only updates existing users

- Run: `pnpm admin:promote -- --email nonexistent@example.com --role SUPER_ADMIN`
- Expected: Script exits with “User not found” and no user is created.

## Files Touched

| Area | File |
|------|------|
| Authz helpers | `apps/core/cardbey-core/src/lib/authorization.js` |
| Draft-store bypass | `apps/core/cardbey-core/src/routes/draftStore.js` |
| Promote CLI | `apps/core/cardbey-core/scripts/promoteUserRole.js` |
| Schema comment | `apps/core/cardbey-core/prisma/schema.prisma` (role comment) |
| Script entry | `apps/core/cardbey-core/package.json` (`admin:promote`) |

## Production safety

- No hardcoded emails; promote script requires explicit `--email` and `--role`.
- Role is never accepted from client (register and profile update do not set `role`).
- Super admin bypass is limited to draft-store ownership checks; no change to store creation or publish flow.
