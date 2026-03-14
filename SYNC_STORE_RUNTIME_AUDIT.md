# Runtime Audit: sync-store Endpoint - Logging Added

**Date:** 2026-01-08  
**Goal:** Prove which code version is actually running when `POST /api/mi/orchestra/job/:jobId/sync-store` is hit

---

## 1. Route Handler Location

**Route Definition:**
- **File:** `apps/core/cardbey-core/src/routes/miRoutes.js`
- **Line:** 776
- **Route:** `router.post('/orchestra/job/:jobId/sync-store', requireAuth, async (req, res) => {`

**Router Mounting:**
- **File:** `apps/core/cardbey-core/src/server.js`
- **Line:** 656
- **Mount:** `app.use('/api/mi', miRoutes);`

**Full Path:** `/api/mi/orchestra/job/:jobId/sync-store`

**Verification:** Only ONE handler is registered for this route (confirmed via grep search).

---

## 2. Temporary Dev Logs Added

The following logs have been added to prove which code is running:

### Log 1: Entry Point (Line 857)
**Location:** Right before Strategy 1, at the start of the sync-store logic

```javascript
console.log('[SYNC_STORE_MARKER] file=', __filename, 'hasMiArtifact=', !!prisma.miArtifact, 'hasFindMany=', !!prisma.miArtifact?.findMany, 'prismaType=', typeof prisma, 'prismaKeys=', Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_')).slice(0, 10).join(','));
```

**What it shows:**
- `__filename`: Absolute path of the file being executed
- `hasMiArtifact`: Boolean - whether `prisma.miArtifact` exists
- `hasFindMany`: Boolean - whether `prisma.miArtifact.findMany` exists
- `prismaType`: Type of `prisma` object
- `prismaKeys`: First 10 Prisma model names (to verify client state)

### Log 2: Before Guard Check (Line 866)
**Location:** Right before the `if (prisma.miArtifact)` guard

```javascript
console.log('[SYNC_STORE_MARKER] Before guard check: prisma.miArtifact=', prisma.miArtifact, 'typeof=', typeof prisma.miArtifact);
```

**What it shows:**
- Raw value of `prisma.miArtifact` (should be `undefined` if model doesn't exist)
- Type of `prisma.miArtifact`

### Log 3: Guard Passed (Line 868)
**Location:** Inside the `if (prisma.miArtifact)` block, immediately after guard check

```javascript
console.log('[SYNC_STORE_MARKER] Guard passed - entering MiArtifact block');
```

**What it shows:**
- Confirms the guard condition evaluated to `true`
- This should NOT appear if `prisma.miArtifact` is `undefined`

### Log 4: Before findMany Call (Line 869)
**Location:** Right before calling `prisma.miArtifact.findMany()`

```javascript
console.log('[SYNC_STORE_MARKER] About to call findMany, prisma.miArtifact.findMany=', typeof prisma.miArtifact.findMany);
```

**What it shows:**
- Type of `prisma.miArtifact.findMany` (should be `'function'` if it exists, `'undefined'` if not)

### Log 5: findMany Succeeded (Line 881)
**Location:** Immediately after `findMany` call succeeds

```javascript
console.log('[SYNC_STORE_MARKER] findMany succeeded, stageOutputs.length=', stageOutputs.length);
```

**What it shows:**
- Confirms `findMany` completed without error
- Number of stage outputs found

### Log 6: Guard Failed (Line 932)
**Location:** In the `else` block when guard fails

```javascript
console.log('[SYNC_STORE_MARKER] Guard failed - prisma.miArtifact is falsy, skipping MiArtifact query');
```

**What it shows:**
- Confirms the guard evaluated to `false`
- This SHOULD appear if `prisma.miArtifact` is `undefined`

### Log 7: findMany Crash (Line 928)
**Location:** In the inner `catch` block around `findMany` call

```javascript
console.error('[SYNC_STORE_MARKER] MiArtifact findMany CRASHED:', findManyError.message, 'stack:', findManyError.stack?.split('\n').slice(0, 3).join(' | '));
```

**What it shows:**
- Error message if `findMany` throws
- First 3 lines of stack trace

### Log 8: Outer Catch (Line 939)
**Location:** In the outer `catch` block

```javascript
console.error('[SYNC_STORE_MARKER] Outer try/catch caught error:', miArtifactError.message, 'stack:', miArtifactError.stack?.split('\n').slice(0, 3).join(' | '));
```

**What it shows:**
- Any error caught by the outer try/catch
- Stack trace snippet

---

## 3. Expected Log Sequences

### Scenario A: Guard Works (Expected - Current Code)
If the guard is working correctly and `prisma.miArtifact` is `undefined`:

```
[SYNC_STORE_MARKER] file= C:\Projects\cardbey\apps\core\cardbey-core\src\routes\miRoutes.js hasMiArtifact= false hasFindMany= false prismaType= object prismaKeys= activityEvent, assistantSuggestion, business, ...
[SYNC_STORE_MARKER] Before guard check: prisma.miArtifact= undefined typeof= undefined
[SYNC_STORE_MARKER] Guard failed - prisma.miArtifact is falsy, skipping MiArtifact query
```

**No crash should occur** - the code should continue to Strategy 2 (task.outputs).

### Scenario B: Guard Fails (Unexpected - Old Code)
If the guard is NOT present or fails, and `findMany` is called on `undefined`:

```
[SYNC_STORE_MARKER] file= <some path> hasMiArtifact= false hasFindMany= false ...
[SYNC_STORE_MARKER] Before guard check: prisma.miArtifact= undefined typeof= undefined
[SYNC_STORE_MARKER] Guard passed - entering MiArtifact block  <-- THIS SHOULD NOT APPEAR
[SYNC_STORE_MARKER] About to call findMany, prisma.miArtifact.findMany= undefined
[SYNC_STORE_MARKER] MiArtifact findMany CRASHED: Cannot read properties of undefined (reading 'findMany')
```

**Crash occurs** - proves old code is running or guard is broken.

### Scenario C: Model Exists (Future State)
If `MiArtifact` model is added to schema and client is regenerated:

```
[SYNC_STORE_MARKER] file= C:\Projects\cardbey\apps\core\cardbey-core\src\routes\miRoutes.js hasMiArtifact= true hasFindMany= function prismaType= object prismaKeys= ..., miArtifact, ...
[SYNC_STORE_MARKER] Before guard check: prisma.miArtifact= [object Object] typeof= object
[SYNC_STORE_MARKER] Guard passed - entering MiArtifact block
[SYNC_STORE_MARKER] About to call findMany, prisma.miArtifact.findMany= function
[SYNC_STORE_MARKER] findMany succeeded, stageOutputs.length= 0
```

**No crash** - model exists and query executes.

---

## 4. Testing Steps

1. **Restart the server:**
   ```powershell
   cd apps/core/cardbey-core
   # Stop current server (Ctrl+C)
   # Start server again
   npm start
   # or
   node src/server.js
   ```

2. **Trigger sync-store endpoint:**
   - Via dashboard: Complete a store generation flow that triggers sync-store
   - Via curl:
     ```powershell
     $jobId = "cmk58t9x70000jvz4cthgs99t"  # Replace with actual jobId
     $token = "your-auth-token"  # Replace with actual token
     Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/mi/orchestra/job/$jobId/sync-store" -Method POST -Headers @{ "Authorization" = "Bearer $token" }
     ```

3. **Capture logs:**
   - Check server console output
   - Look for all `[SYNC_STORE_MARKER]` log lines
   - Note the sequence and values

4. **Analyze results:**
   - If logs show `hasMiArtifact= false` and `Guard failed` → **Guard is working, no crash expected**
   - If logs show `Guard passed` but `hasMiArtifact= false` → **Guard is broken or old code is running**
   - If logs show crash at `findMany` → **Code is trying to call findMany on undefined**

---

## 5. What to Look For

### Evidence of Correct Code Running:
- ✅ `__filename` matches: `C:\Projects\cardbey\apps\core\cardbey-core\src\routes\miRoutes.js`
- ✅ `hasMiArtifact= false`
- ✅ `Guard failed` log appears
- ✅ No crash occurs
- ✅ Code continues to Strategy 2

### Evidence of Old Code Running:
- ⚠️ `__filename` does NOT match expected path
- ⚠️ `Guard passed` appears when `hasMiArtifact= false`
- ⚠️ Crash occurs at `findMany` call
- ⚠️ No `Guard failed` log appears

### Evidence of Guard Broken:
- ⚠️ `hasMiArtifact= false` but `Guard passed` appears
- ⚠️ `prisma.miArtifact.findMany= undefined` but code still tries to call it
- ⚠️ Crash occurs inside the guard block

---

## 6. Next Steps After Testing

**If Scenario A (Guard Works):**
- ✅ Current code is correct
- ✅ No crash should occur
- ✅ Remove temporary logs after confirming
- ✅ Document that MiArtifact is intentionally disabled

**If Scenario B (Guard Fails or Old Code):**
- ⚠️ Server may be running cached/old code
- ⚠️ Restart server and clear any build caches
- ⚠️ Verify file is actually being loaded from expected path
- ⚠️ Check for multiple copies of miRoutes.js

**If Scenario C (Model Exists):**
- ✅ MiArtifact model was added to schema
- ✅ Prisma client was regenerated
- ✅ Code should work without guards (but guards are still safe)

---

## 7. File Path Verification

The `__filename` log will show the absolute path of the file being executed. This proves:
- Which file is actually running
- Whether it's the expected file
- Whether there are multiple copies or cached versions

**Expected path:**
```
C:\Projects\cardbey\apps\core\cardbey-core\src\routes\miRoutes.js
```

**If different path appears:**
- Server may be loading from a different location
- Build cache may be serving old code
- Multiple copies of the file may exist










