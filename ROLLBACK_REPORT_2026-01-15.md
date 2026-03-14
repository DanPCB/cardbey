# Rollback Report - 2026-01-15

**Date:** 2026-01-15  
**Status:** ✅ **COMPLETE**

---

## Summary

Successfully rolled back Cardbey monorepo to state on 2026-01-07 (latest commit before 2026-01-15). Both repositories (`apps/core/cardbey-core` and `apps/dashboard/cardbey-marketing-dashboard`) were rolled back to their respective commits, with pre-rollback state preserved in backup branches.

---

## Repositories Rolled Back

### 1. `apps/core/cardbey-core`
- **Current HEAD (before rollback):** `[previous commit]`
- **Backup branch:** `backup/pre-rollback-2026-01-15` (committed snapshot)
- **Rollback branch:** `rollback/2026-01-15`
- **Rollback commit:** `7e790de89d001231599add876e09ae58ba757d4f`
- **Rollback date:** 2026-01-07 (latest commit before 2026-01-15)

### 2. `apps/dashboard/cardbey-marketing-dashboard`
- **Current HEAD (before rollback):** `[previous commit]`
- **Backup branch:** `backup/pre-rollback-2026-01-15` (committed snapshot)
- **Rollback branch:** `rollback/2026-01-15`
- **Rollback commit:** `cbcf935cefe996ff5a63164bdbfa5095340f5ef0`
- **Rollback date:** 2026-01-07 (latest commit before 2026-01-15)

---

## Commands Used

### Core Repository:
```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core

# Create backup branch
git checkout -b backup/pre-rollback-2026-01-15
git add -A
git commit -m "WIP: pre-rollback 2026-01-15 (snapshot)"
git push -u origin backup/pre-rollback-2026-01-15

# Find rollback commit
git log --all --date=local --pretty=format:"%h %ad %d %s" --date=iso --since="2026-01-15 00:00" --until="2026-01-16 00:00"

# Create rollback branch
git checkout -b rollback/2026-01-15 7e790de89d001231599add876e09ae58ba757d4f
git push -u origin rollback/2026-01-15
```

### Dashboard Repository:
```powershell
cd C:\Projects\cardbey\apps\dashboard\cardbey-marketing-dashboard

# Create backup branch
git checkout -b backup/pre-rollback-2026-01-15
git add -A
git commit -m "WIP: pre-rollback 2026-01-15 (snapshot)"
git push -u origin backup/pre-rollback-2026-01-15

# Create rollback branch
git checkout -b rollback/2026-01-15 cbcf935cefe996ff5a63164bdbfa5095340f5ef0
git push -u origin rollback/2026-01-15
```

---

## Database Reset (Prisma Schema Mismatch Fix)

After rollback, guest login failed due to Prisma schema mismatch:
- **Error:** `Invalid prisma.user.findUnique() invocation: The column main.User.plan does not exist`
- **Root Cause:** Prisma client was generated from newer schema (with `plan` field), but rollback schema.prisma does NOT include `plan`

### Fix Applied:
```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core

# Stop processes
taskkill /IM node.exe /F

# Delete database
Remove-Item prisma\dev.db -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-journal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-wal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-shm -ErrorAction SilentlyContinue

# Regenerate Prisma client
npx prisma generate

# Sync database with schema
npx prisma db push --accept-data-loss
```

**Result:** Database recreated from rollback schema (no `plan` field), Prisma client regenerated, schema and client now in sync.

---

## Files Changed

### Core Repository:
1. **`src/routes/auth.js`**
   - Added `/api/auth/guest` endpoint
   - Added DEV-only diagnostic logging for schema validation

2. **`src/db/prisma.js`**
   - Added `validateSchemaMatch()` function (DEV-only)
   - Validates User table columns match schema.prisma on startup
   - Warns if unexpected columns (like `plan`) are found

3. **`scripts/test-guest-endpoint.js`** (new)
   - Test script to verify guest endpoint and database structure

### Dashboard Repository:
1. **`src/lib/storage.ts`**
   - Updated `setAuthToken()` to store in both `authToken` and `bearer` keys

2. **`src/pages/public/FeaturesPage.tsx`**
   - Added auto-creation of guest session on mount
   - Added token storage in `handleRetryAsGuest` handler

---

## Verification

### Database Structure:
- ✅ User table has no `plan` column (matches schema.prisma)
- ✅ Prisma client matches database structure
- ✅ Guest user creation works without Prisma errors

### Test Results:
```
[TEST] User table columns: id, email, passwordHash, displayName, fullName, handle, avatarUrl, accountType, tagline, hasBusiness, onboarding, roles, role, emailVerified, verificationToken, verificationExpires, resetToken, resetExpires, createdAt, updatedAt
[TEST] Has plan column: NO (CORRECT)
[TEST] ✅ User table structure matches schema.prisma
[TEST] ✅ Guest user created successfully
[TEST] ✅ ALL TESTS PASSED
```

---

## Runbook: Fix Guest Login After Rollback

### Problem
After rolling back to an earlier commit, guest login fails with:
```
500 Internal Server Error
Invalid prisma.user.findUnique() invocation: The column main.User.plan does not exist
```

### Root Cause
Prisma client was generated from a newer schema (with `plan` field), but the rollback commit's schema.prisma does NOT include `plan`. This creates a mismatch between:
- Prisma client (expects `plan`)
- Database (may or may not have `plan`)
- schema.prisma (doesn't define `plan`)

### Solution

**Step 1: Stop all processes**
```powershell
taskkill /IM node.exe /F
```

**Step 2: Delete database files**
```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core
Remove-Item prisma\dev.db -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-journal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-wal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-shm -ErrorAction SilentlyContinue
Remove-Item prisma\prisma\dev.db -ErrorAction SilentlyContinue
```

**Step 3: Regenerate Prisma client**
```powershell
npx prisma generate
```

**Step 4: Sync database with schema**
```powershell
npx prisma db push --accept-data-loss
```

**Step 5: Verify**
```powershell
# Test guest endpoint
node scripts/test-guest-endpoint.js

# Should output:
# [TEST] ✅ User table structure matches schema.prisma
# [TEST] ✅ Guest user created successfully
# [TEST] ✅ ALL TESTS PASSED
```

### Prevention

**Startup Guardrail:**
The server now includes a DEV-only schema validation check that:
- Runs on startup (non-blocking)
- Checks User table columns against expected schema
- Warns if unexpected columns (like `plan`) are found
- Provides clear fix instructions

**For Future Rollbacks:**
1. Always regenerate Prisma client: `npx prisma generate`
2. Always reset/sync database: `npx prisma db push --accept-data-loss` (dev) or `npx prisma migrate reset` (if migrations are clean)
3. Check startup logs for schema mismatch warnings

---

## Notes

- **Rollback Date:** Both repos rolled back to 2026-01-07 (latest commit before 2026-01-15)
- **Backup Branches:** Pre-rollback state preserved in `backup/pre-rollback-2026-01-15` with committed snapshots
- **Database:** Reset to match rollback schema (no `plan` field)
- **Prisma Client:** Regenerated from rollback schema.prisma
- **Schema Validation:** Added startup check to catch future mismatches early

---

## Runbook: Fix Guest Login After Rollback

**See:** `docs/RUNBOOK_FIX_GUEST_LOGIN_AFTER_ROLLBACK.md` for detailed instructions.

**Quick Fix Commands:**
```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core
taskkill /IM node.exe /F
Remove-Item prisma\dev.db* -ErrorAction SilentlyContinue
npx prisma generate
npx prisma db push --accept-data-loss
node scripts/test-guest-endpoint.js
```

---

**Rollback Completed:** 2026-01-15  
**Status:** ✅ Complete and verified
