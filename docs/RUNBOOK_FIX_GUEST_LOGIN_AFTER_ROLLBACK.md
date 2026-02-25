# Runbook: Fix Guest Login After Rollback

**Last Updated:** 2026-01-15  
**Status:** ✅ Verified

---

## Problem

After rolling back to an earlier commit, guest login fails with:
```
500 Internal Server Error
Invalid prisma.user.findUnique() invocation: The column main.User.plan does not exist
```

---

## Root Cause

**Schema Mismatch:** Prisma client was generated from a newer schema (with `plan` field), but the rollback commit's `schema.prisma` does NOT include `plan`. This creates a mismatch between:
- **Prisma client** (expects `plan` column)
- **Database** (may or may not have `plan` column)
- **schema.prisma** (doesn't define `plan`)

**Why This Happens:**
- After rollback, `schema.prisma` matches the rollback commit (no `plan`)
- But `node_modules/.prisma/client` was generated from a newer schema (with `plan`)
- Database may have been migrated with `plan` column from a later migration
- Prisma client tries to access `plan` → fails because schema doesn't define it

---

## Solution

### Step 1: Stop All Processes

Stop any processes that might lock the database:

```powershell
taskkill /IM node.exe /F
```

**Why:** SQLite database files can be locked by running Node processes, preventing deletion/reset.

---

### Step 2: Delete Database Files

Delete the existing database to start fresh:

```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core

Remove-Item prisma\dev.db -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-journal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-wal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-shm -ErrorAction SilentlyContinue
Remove-Item prisma\prisma\dev.db -ErrorAction SilentlyContinue
```

**Why:** We need a clean database that matches the rollback schema.

---

### Step 3: Regenerate Prisma Client

Regenerate Prisma client from the current `schema.prisma`:

```powershell
npx prisma generate
```

**Why:** Ensures Prisma client matches the rollback commit's schema (no `plan` field).

**Expected Output:**
```
✔ Generated Prisma Client (v6.18.0) to .\node_modules\@prisma\client
```

---

### Step 4: Sync Database with Schema

Create a new database from the current schema:

```powershell
npx prisma db push --accept-data-loss
```

**Why:** Creates a fresh database that matches `schema.prisma` exactly.

**Expected Output:**
```
Your database is now in sync with your Prisma schema. Done in 2.14s
✔ Generated Prisma Client (v6.18.0) to .\node_modules\@prisma\client
```

**Note:** Use `--accept-data-loss` in development. In production, use `prisma migrate deploy` instead.

---

### Step 5: Verify Fix

Run the test script to verify everything works:

```powershell
node scripts/test-guest-endpoint.js
```

**Expected Output:**
```
[TEST] User table columns: id, email, passwordHash, displayName, fullName, handle, avatarUrl, accountType, tagline, hasBusiness, onboarding, roles, role, emailVerified, verificationToken, verificationExpires, resetToken, resetExpires, createdAt, updatedAt
[TEST] Has plan column: NO (CORRECT)
[TEST] ✅ User table structure matches schema.prisma
[TEST] ✅ Guest user created successfully
[TEST] ✅ ALL TESTS PASSED
```

---

## Complete Command Sequence

```powershell
# Navigate to core repo
cd C:\Projects\cardbey\apps\core\cardbey-core

# 1. Stop processes
taskkill /IM node.exe /F

# 2. Delete database
Remove-Item prisma\dev.db -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-journal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-wal -ErrorAction SilentlyContinue
Remove-Item prisma\dev.db-shm -ErrorAction SilentlyContinue

# 3. Regenerate Prisma client
npx prisma generate

# 4. Sync database
npx prisma db push --accept-data-loss

# 5. Verify
node scripts/test-guest-endpoint.js
```

---

## Prevention

### Startup Guardrail

The server now includes a DEV-only schema validation check that:
- Runs automatically on startup (non-blocking)
- Checks User table columns against expected schema
- Warns if unexpected columns (like `plan`) are found
- Provides clear fix instructions

**Example Warning:**
```
[DB][SCHEMA_MISMATCH] ⚠️  Prisma schema does not match database structure!
[DB][SCHEMA_MISMATCH] Unexpected columns in DB: plan
[DB][SCHEMA_MISMATCH] Fix: Run "npx prisma db push --accept-data-loss" to sync DB with schema
```

### For Future Rollbacks

**Always run these commands after rollback:**
1. `npx prisma generate` - Regenerate client from rollback schema
2. `npx prisma db push --accept-data-loss` - Sync database with schema (dev)
3. Check startup logs for schema mismatch warnings

---

## Troubleshooting

### Issue: "Migration failed to apply cleanly"

**Symptom:**
```
Error: P3006
Migration `add_product_source_generation_run_id` failed to apply cleanly
```

**Solution:**
Use `prisma db push` instead of `prisma migrate dev`:
```powershell
npx prisma db push --accept-data-loss
```

**Why:** After rollback, migrations may be out of sync. `db push` syncs directly with schema without going through migrations.

---

### Issue: "Database is locked"

**Symptom:**
```
Error: database is locked
```

**Solution:**
1. Stop all Node processes: `taskkill /IM node.exe /F`
2. Close Prisma Studio if open
3. Close any SQLite viewers
4. Retry the command

---

### Issue: "Column still doesn't exist" after fix

**Symptom:**
Still getting errors about missing columns after running the fix.

**Solution:**
1. Verify you're on the rollback branch: `git rev-parse --abbrev-ref HEAD`
2. Check schema.prisma doesn't have the column: `grep -i "plan" prisma/schema.prisma`
3. Regenerate client again: `npx prisma generate`
4. Verify database: `node scripts/test-guest-endpoint.js`

---

## Verification Checklist

After running the fix, verify:

- ✅ Database deleted and recreated
- ✅ Prisma client regenerated
- ✅ Database synced with schema.prisma
- ✅ Test script passes: `node scripts/test-guest-endpoint.js`
- ✅ Server starts without schema mismatch warnings
- ✅ POST `/api/auth/guest` returns 200 with valid JSON
- ✅ Frontend `/features` page auto-creates guest session

---

## Related Files

- **Schema:** `apps/core/cardbey-core/prisma/schema.prisma`
- **Database:** `apps/core/cardbey-core/prisma/dev.db`
- **Test Script:** `apps/core/cardbey-core/scripts/test-guest-endpoint.js`
- **Schema Validation:** `apps/core/cardbey-core/src/db/prisma.js` (validateSchemaMatch function)
- **Guest Endpoint:** `apps/core/cardbey-core/src/routes/auth.js` (POST /api/auth/guest)

---

**Status:** ✅ Fix verified and documented  
**Last Verified:** 2026-01-15





