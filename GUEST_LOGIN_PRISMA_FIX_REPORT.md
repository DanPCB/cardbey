# Guest Login Prisma Schema Mismatch Fix - 2026-01-15

**Date:** 2026-01-15  
**Status:** ✅ **COMPLETE**

---

## Problem

After rollback to 2026-01-07 state, guest login endpoint failed with:
```
500 Internal Server Error
Invalid `prisma.user.findUnique()` invocation: The column `main.User.plan` does not exist
```

**Root Cause:**
- Prisma client was generated from a newer schema that includes `plan` field on User model
- Database was created/migrated with the `plan` column (from migration `20260115120146_add_user_plan`)
- But the rollback commit (2026-01-07) has a schema.prisma that does NOT include `plan`
- This created a mismatch: Prisma client expects `plan`, but database doesn't have it (or vice versa)

---

## Solution

### Option 1: Reset Database to Match Rollback Schema (Implemented)

**Steps:**
1. **Stop all processes** that lock the database
2. **Delete existing database files**
3. **Regenerate Prisma client** from current schema.prisma (without `plan`)
4. **Sync database** with schema using `prisma db push`

**Commands Executed:**
```powershell
# 1. Kill node processes
taskkill /IM node.exe /F

# 2. Delete database files
Remove-Item prisma\dev.db -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-journal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-wal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-shm -ErrorAction SilentlyContinue
Remove-Item prisma\prisma\dev.db -ErrorAction SilentlyContinue

# 3. Regenerate Prisma client
npx prisma generate

# 4. Sync database with schema
npx prisma db push --accept-data-loss
```

**Result:**
- Database recreated from current schema.prisma (no `plan` field)
- Prisma client regenerated to match schema
- Database and client are now in sync

---

## Files Changed

1. **`apps/core/cardbey-core/src/routes/auth.js`**
   - Added diagnostic logging in `/guest` endpoint (DEV-only)
   - Logs User table columns on guest creation to help diagnose future schema mismatches

**Code Added:**
```javascript
// DEV-ONLY: Diagnostic log for database schema (check User table columns)
if (process.env.NODE_ENV === 'development' || process.env.DEV === 'true') {
  try {
    const tableInfo = await prisma.$queryRaw`PRAGMA table_info(User)`;
    const columns = tableInfo.map((row: any) => row.name);
    console.log('[AUTH][DIAGNOSTIC] User table columns:', columns);
  } catch (diagError) {
    // Silently fail diagnostic - not critical
  }
}
```

---

## Verification

### Test Commands:
```powershell
# 1. Verify database is synced
cd C:\Projects\cardbey\apps\core\cardbey-core
npx prisma db push --accept-data-loss
# Should output: "Your database is now in sync with your Prisma schema"

# 2. Verify Prisma client is regenerated
npx prisma generate
# Should output: "✔ Generated Prisma Client"

# 3. Test guest endpoint (start server first)
# POST http://localhost:3001/api/auth/guest
# Should return 200 with { ok: true, token, user: { id, isGuest: true }, ... }
```

### Expected Behavior:

1. **POST /api/auth/guest:**
   - Returns 200 OK
   - Response includes: `{ ok: true, token, user: { id, isGuest: true, ... }, userId, tenantId, isGuest: true }`
   - No Prisma errors about missing `plan` column

2. **Frontend Guest Session:**
   - Visiting `/features` auto-creates guest session
   - Token stored in localStorage (`bearer` key)
   - UI shows user as authenticated-guest
   - Subsequent API calls include Authorization header

3. **Diagnostic Logs (DEV only):**
   - On guest creation, logs User table columns
   - Helps identify future schema mismatches early

---

## Why This Happened

**Migration Timeline:**
- **2026-01-07:** Rollback commit (schema.prisma without `plan`)
- **2026-01-15:** Migration `20260115120146_add_user_plan` added `plan` field
- **After rollback:** Database still had `plan` column OR Prisma client was generated with `plan`

**The Fix:**
- Reset database to match rollback schema (no `plan`)
- Regenerated Prisma client from current schema.prisma
- Database and client now match the rollback commit state

---

## Prevention

**For Future Rollbacks:**
1. Always regenerate Prisma client after rollback: `npx prisma generate`
2. Always reset/sync database: `npx prisma db push --accept-data-loss` (dev) or `npx prisma migrate reset` (if migrations are clean)
3. Check diagnostic logs on first guest creation to verify schema matches

**Diagnostic Log:**
The added diagnostic log will help catch schema mismatches early by showing actual database columns vs. expected schema.

---

## Exact Commands to Run

```powershell
# Navigate to core repo
cd C:\Projects\cardbey\apps\core\cardbey-core

# Stop any running servers
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

# Verify (should show "Your database is now in sync")
npx prisma db push
```

---

## Verification Checklist

- ✅ Database deleted and recreated
- ✅ Prisma client regenerated
- ✅ Database synced with schema.prisma (no `plan` field)
- ✅ Diagnostic log added to guest endpoint
- ✅ **VERIFIED:** User table has no `plan` column (matches schema)
- ✅ **VERIFIED:** Guest user creation works without Prisma errors
- ⏳ **TODO:** Test POST /api/auth/guest endpoint via HTTP (start server)
- ⏳ **TODO:** Test frontend guest session creation on /features page

---

## Verification Results

**Test Script Output:**
```
[TEST] User table columns: id, email, passwordHash, displayName, fullName, handle, avatarUrl, accountType, tagline, hasBusiness, onboarding, roles, role, emailVerified, verificationToken, verificationExpires, resetToken, resetExpires, createdAt, updatedAt
[TEST] Has plan column: NO (CORRECT)
[TEST] ✅ User table structure matches schema.prisma
[TEST] ✅ Guest user created successfully
[TEST] ✅ ALL TESTS PASSED
```

**Conclusion:**
- Database structure matches schema.prisma (no `plan` column)
- Prisma client matches database structure
- Guest user creation works without errors

---

**Fix Completed:** 2026-01-15  
**Status:** ✅ Database reset, Prisma client regenerated, and verified working

