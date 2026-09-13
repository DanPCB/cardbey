# Impact Report: Store delete 403 for Platform Admin

## Problem

On live (`cardbey.com`), deleting a store from the store profile / danger zone fails with:

**`403 This action requires owner permissions`**

even when the signed-in user is **Platform Admin**.

## Root cause

1. Dashboard delete calls `DELETE /api/stores/:storeId` (via `delete_store` dispatch).
2. That route uses `requireOwner`, which only allows `req.user.role === 'owner'`.
3. Platform Admin has `platform_admin` (or equivalent), so middleware returns 403 before the handler runs.
4. Even past that gate, the handler also requires `store.userId === req.userId`, which would block admins deleting another user’s store.

Admin delete already works on a separate path: `DELETE /api/admin/platform/account-management/stores/:storeId` (`requireAdmin` + `adminDeleteStore`). The profile UI does not use that path.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Unauthorized hard-delete | Broadening who can call DELETE | Allow only store owner (`store.userId`) **or** `isPlatformAdmin` / non-prod `isDevAdmin`; keep hybrid confirmation |
| Accidental widening of other routes | Changing shared `requireOwner` | **Do not** change `requireOwner` globally (still used by PATCH / identity / artifacts) |
| Behavior change for true owners | Owner path already worked when `role === 'owner'` and `userId` match | Owner path remains allowed via `store.userId === req.userId` |

## Impact scope

- **Affected:** Store profile / account menu / overview “Delete store” → `DELETE /api/stores/:storeId`
- **Not affected:** Admin Control Center account-management delete; PATCH store; other `requireOwner` routes
- **Auth model:** Aligns DELETE with existing store draft/access checks that already allow `isPlatformAdmin`

## Smallest safe patch

In `apps/core/cardbey-core/src/routes/stores.js` DELETE `/:storeId` only:

1. Keep `requireAuth` + `wrapHybridRoute` confirmation.
2. Remove `requireOwner` from this route only.
3. Allow delete when `isPlatformAdmin(req.user)` or non-prod `isDevAdmin`, **or** `store.userId === req.userId`.
4. Leave delete transaction / cleanup logic unchanged.

## Proceed

Implement the patch above (delete-route auth only).
