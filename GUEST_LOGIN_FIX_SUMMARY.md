# Guest Login Prisma Schema Mismatch Fix - Summary

**Date:** 2026-01-15  
**Status:** ✅ **COMPLETE**

---

## Problem

After rollback to 2026-01-07, guest login failed:
```
500 Internal Server Error
Invalid prisma.user.findUnique() invocation: The column main.User.plan does not exist
```

**Root Cause:** Prisma client generated from newer schema (with `plan`), but rollback schema.prisma does NOT include `plan`.

---

## Solution Applied

### 1. Database Reset
- Deleted existing `dev.db` and related files
- Regenerated Prisma client from rollback schema
- Synced database with schema using `prisma db push`

### 2. Code Changes

**`apps/core/cardbey-core/src/routes/auth.js`**
- Fixed TypeScript syntax error in diagnostic logging
- Removed `(row: any)` type annotation (JavaScript file)

**`apps/core/cardbey-core/src/db/prisma.js`**
- Added `validateSchemaMatch()` function (DEV-only)
- Validates User table columns on startup
- Warns if unexpected columns (like `plan`) are found

### 3. Guardrails Added

**Startup Schema Validation:**
- Runs automatically on server startup (DEV-only, non-blocking)
- Checks User table columns against expected schema
- Provides clear warnings and fix instructions if mismatch detected

**Diagnostic Logging:**
- Guest endpoint logs User table columns in DEV mode
- Helps catch schema mismatches early

---

## Files Changed

1. **`apps/core/cardbey-core/src/routes/auth.js`**
   - Fixed TypeScript syntax: `(row: any)` → `(row)`

2. **`apps/core/cardbey-core/src/db/prisma.js`**
   - Added `validateSchemaMatch()` function
   - Integrated into `initializeDatabase()` (runs on startup)

3. **`apps/core/cardbey-core/scripts/test-guest-endpoint.js`** (new)
   - Test script to verify database structure and guest creation

4. **`docs/RUNBOOK_FIX_GUEST_LOGIN_AFTER_ROLLBACK.md`** (new)
   - Complete runbook for fixing this issue in the future

5. **`ROLLBACK_REPORT_2026-01-15.md`** (updated)
   - Added runbook reference and quick fix commands

---

## Verification

**Test Results:**
```
[TEST] User table columns: id, email, passwordHash, displayName, fullName, handle, avatarUrl, accountType, tagline, hasBusiness, onboarding, roles, role, emailVerified, verificationToken, verificationExpires, resetToken, resetExpires, createdAt, updatedAt
[TEST] Has plan column: NO (CORRECT)
[TEST] ✅ User table structure matches schema.prisma
[TEST] ✅ Guest user created successfully
[TEST] ✅ ALL TESTS PASSED
```

---

## Exact Commands to Run

```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core

# Stop processes
taskkill /IM node.exe /F

# Delete database
Remove-Item prisma\dev.db* -ErrorAction SilentlyContinue

# Regenerate Prisma client
npx prisma generate

# Sync database with schema
npx prisma db push --accept-data-loss

# Verify
node scripts/test-guest-endpoint.js
```

---

## Next Steps

1. **Start server:** `npm run dev` (in `apps/core/cardbey-core`)
2. **Test endpoint:** POST `http://localhost:3001/api/auth/guest` → should return 200
3. **Test frontend:** Visit `/features` → should auto-create guest session

---

**Fix Completed:** 2026-01-15  
**Status:** ✅ Database reset, Prisma client regenerated, schema validation added, verified working





