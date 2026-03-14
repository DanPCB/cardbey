# Deep Audit: `prisma.miArtifact` Undefined Error

**Date:** 2026-01-08  
**Error:** `TypeError: Cannot read properties of undefined (reading 'findMany')` at `miRoutes.js:855`  
**Context:** `sync-store` endpoint crash during product extraction

---

## 1. Code Inspection (Line 855 Area)

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Current code at line 855:**
```javascript
853|    try {
854|      // Strategy 1: Get stage outputs from MiArtifact (if model exists)
855|      let stageOutputs = [];
856|      let catalogOutput = null;
857|      let foundStageName = null;
858|      
859|      try {
860|        // Check if MiArtifact model exists (it may not be in schema yet)
861|        if (prisma.miArtifact) {
862|          stageOutputs = await prisma.miArtifact.findMany({
```

**Observation:** Line 855 is a variable declaration (`let stageOutputs = [];`), not a Prisma call. The actual `prisma.miArtifact.findMany` call is at line 862, which is **guarded** by `if (prisma.miArtifact)` at line 861.

**All `prisma.miArtifact` usages in current code:**
- Line 861: `if (prisma.miArtifact)` - **GUARDED**
- Line 862: `await prisma.miArtifact.findMany(...)` - **GUARDED** (inside if block)
- Line 1028: `if (prisma.miArtifact)` - **GUARDED**
- Line 1030: `await prisma.miArtifact.upsert(...)` - **GUARDED** (inside if block)
- Line 1057: `await prisma.miArtifact.create(...)` - **GUARDED** (inside try/catch within if block)
- Line 1084: `if (catalogOutput && foundStageName === 'task.outputs' && prisma.miArtifact)` - **GUARDED**
- Line 1086: `await prisma.miArtifact.create(...)` - **GUARDED** (inside if block)

**Conclusion:** All current usages are properly guarded. The error at line 855 suggests either:
1. The error is from an older version of the code (before guards were added)
2. Line numbers shifted after code changes
3. A different code path exists that's not guarded (unlikely based on grep results)

---

## 2. Prisma Import & Client Initialization

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Import:**
```javascript
9|import { PrismaClient } from '@prisma/client';
13|const prisma = new PrismaClient();
```

**Verification:**
- ✅ Prisma is imported from `@prisma/client` (standard package)
- ✅ Single `prisma` instance created at module level
- ✅ No variable shadowing in `sync-store` function scope
- ✅ Same Prisma instance used elsewhere in file (e.g., `prisma.orchestratorTask`, `prisma.business`)

---

## 3. Prisma Schema Verification

**File:** `apps/core/cardbey-core/prisma/schema.prisma`

**Search Results:**
```bash
$ grep -i "model.*MiArtifact\|model.*Artifact\|MiArtifact" schema.prisma
# No matches found
```

**Confirmed Models (54 total):**
- User, Business, Product, Demand, JourneyTemplate, JourneyStepTemplate, JourneyInstance, JourneyStep, PlannerTask, AssistantSuggestion, EventLog, SuggestionLog, IdempotencyKey, PriceChange, ReorderRequest, CreativeRefreshTask, Screen, Media, Playlist, PlaylistItem, Workflow, Campaign, TrendProfile, PairingSession, PairCode, Content, LoyaltyProgram, LoyaltyStamp, LoyaltyReward, PromoRule, PromoRedemption, SignageAsset, PlaylistSchedule, Device, DevicePairing, DeviceCapability, DeviceStateSnapshot, DevicePlaylistBinding, DeviceCommand, SystemEvent, SystemInsight, DeviceLog, DeviceAlert, RagChunk, ActivityEvent, TenantReport, TenantInsight, OrchestratorTask, MIEntity, CreativeTemplate, GreetingCard, MiVideoTemplate, MiMusicTrack, DraftStore

**Conclusion:** ❌ **`MiArtifact` model does NOT exist in the Prisma schema.**

---

## 4. Generated Prisma Client Verification

**Runtime Check:**
```javascript
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
console.log('miArtifact' in p ? 'EXISTS' : 'MISSING');
// Output: MISSING
```

**Available Models in Generated Client:**
```
activityEvent, assistantSuggestion, business, campaign, content, creativeRefreshTask, 
creativeTemplate, demand, device, deviceAlert, deviceCapability, deviceCommand, deviceLog, 
devicePairing, devicePlaylistBinding, deviceStateSnapshot, draftStore, eventLog, greetingCard, 
idempotencyKey, journeyInstance, journeyStep, journeyStepTemplate, journeyTemplate, 
loyaltyProgram, loyaltyReward, loyaltyStamp, mIEntity, media, miMusicTrack, miVideoTemplate, 
orchestratorTask, pairCode, pairingSession, plannerTask, playlist, playlistItem, playlistSchedule, 
priceChange, product, promoRedemption, promoRule, ragChunk, reorderRequest, screen, signageAsset, 
suggestionLog, systemEvent, systemInsight, tenantInsight, tenantReport, trendProfile, user, workflow
```

**Conclusion:** ❌ **`miArtifact` is MISSING from the generated Prisma client.** This is expected since the model doesn't exist in the schema.

---

## 5. Database State Verification

**Database:** `apps/core/cardbey-core/prisma/dev.db` (SQLite)

**Note:** PowerShell syntax limitations prevented direct SQLite query, but based on schema analysis:
- If `MiArtifact` table existed, it would require a Prisma migration
- No migration files were found that create `MiArtifact` table
- Schema drift would occur if table existed but model was missing

**Conclusion:** ❓ **Cannot confirm table existence without direct DB query, but schema indicates table should NOT exist.**

---

## 6. Root Cause Analysis

### Evidence Summary:
1. ✅ **Prisma import is correct** - Standard `@prisma/client` import, single instance
2. ❌ **Model missing from schema** - `MiArtifact` does not exist in `schema.prisma`
3. ❌ **Model missing from generated client** - Runtime check confirms `prisma.miArtifact === undefined`
4. ✅ **Code has guards** - All current usages check `if (prisma.miArtifact)` before accessing
5. ⚠️ **Error line mismatch** - Error reports line 855, but current line 855 is not a Prisma call

### Root Cause (Most Likely):

**The error is from an older version of the code before guards were added.** The current codebase has proper guards (`if (prisma.miArtifact)`) around all `prisma.miArtifact` accesses, which should prevent the crash.

However, if the error is occurring in the current codebase, possible causes:

1. **Stale Prisma client:** The server may be running with an old generated client that was built before guards were added, or the client wasn't regenerated after schema changes.

2. **Code path not guarded:** There may be a code path (e.g., in a different function or file) that accesses `prisma.miArtifact` without a guard, but grep search didn't find it.

3. **Guard evaluation issue:** In JavaScript, `if (prisma.miArtifact)` should safely handle `undefined`, but if `prisma` itself is undefined or if there's a timing issue during Prisma client initialization, the guard might not work as expected.

4. **Line number drift:** The error stack trace may be from a different build/version, or source maps are misaligned.

### Why `prisma.miArtifact` is `undefined`:

**Primary reason:** The `MiArtifact` model does not exist in the Prisma schema, so Prisma Client generation does not include it. When you access `prisma.miArtifact`, it returns `undefined` because the property doesn't exist on the Prisma client instance.

**Secondary reason:** Even if the model existed in the schema, if `npx prisma generate` wasn't run after adding it, the generated client would still be missing the model.

---

## 7. Fix Options (Ranked by Safety)

### Option A: Remove MiArtifact Dependencies (Safest - Current State)
**Status:** Already implemented (guards are in place)

**Action:** Keep the current guard-based approach. The code already handles the missing model gracefully by checking `if (prisma.miArtifact)` before use.

**Pros:**
- ✅ No schema changes required
- ✅ No database migrations needed
- ✅ Code already handles missing model
- ✅ Zero risk of breaking existing functionality

**Cons:**
- ⚠️ MiArtifact persistence is disabled (fallback strategies still work)
- ⚠️ Stage outputs are not persisted for future reads

**Verification:**
- Ensure all `prisma.miArtifact` accesses are guarded (✅ confirmed)
- Test `sync-store` endpoint to ensure it works without MiArtifact (uses fallback strategies)

---

### Option B: Add MiArtifact Model to Schema (Medium Risk)
**Action:** Add the `MiArtifact` model to `schema.prisma`, create migration, regenerate client.

**Schema Addition:**
```prisma
model MiArtifact {
  id                  String   @id @default(cuid())
  orchestratorTaskId  String
  artifactType        String   // e.g., 'stage_output', 'final_result'
  data                Json     // Flexible JSON payload
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([orchestratorTaskId, artifactType])
  @@index([orchestratorTaskId, createdAt])
}
```

**Steps:**
1. Add model to `schema.prisma`
2. Run `npx prisma migrate dev --name add_mi_artifact`
3. Run `npx prisma generate`
4. Restart server
5. Remove guards (optional, but recommended for clarity)

**Pros:**
- ✅ Enables MiArtifact persistence
- ✅ Stage outputs can be reliably retrieved
- ✅ Better long-term architecture

**Cons:**
- ⚠️ Requires database migration
- ⚠️ May break if migration fails or conflicts
- ⚠️ Need to handle existing jobs that don't have artifacts

**Verification:**
- Run migration successfully
- Verify `prisma.miArtifact` exists in generated client
- Test `sync-store` with new model
- Ensure backward compatibility with existing jobs

---

### Option C: Make Guards More Defensive (Low Risk - Enhancement)
**Action:** Add additional defensive checks and better error handling.

**Code Changes:**
```javascript
// Instead of: if (prisma.miArtifact)
// Use: if (prisma && typeof prisma.miArtifact !== 'undefined' && prisma.miArtifact)

// Or wrap in try/catch:
try {
  if (prisma.miArtifact) {
    // ... use prisma.miArtifact
  }
} catch (e) {
  console.warn('[MI Orchestra] MiArtifact model not available:', e.message);
}
```

**Pros:**
- ✅ Extra safety layer
- ✅ Better error messages
- ✅ No schema changes

**Cons:**
- ⚠️ Redundant (guards already work)
- ⚠️ Doesn't solve root cause (model still missing)

---

## 8. Recommended Action Plan

**Immediate (If error is occurring now):**
1. ✅ Verify server is using latest code (guards are present)
2. ✅ Restart server to ensure latest Prisma client is loaded
3. ✅ Check if error persists (may be from old code version)

**Short-term (If MiArtifact is needed):**
1. Choose **Option B** if persistence is required
2. Add `MiArtifact` model to schema
3. Create and run migration
4. Regenerate Prisma client
5. Remove guards (optional)

**Long-term (If MiArtifact is not needed):**
1. Keep **Option A** (current state with guards)
2. Document that MiArtifact is intentionally disabled
3. Consider removing MiArtifact-related code if it's never going to be used

---

## 9. Diagnostic Commands

**Verify Prisma client:**
```powershell
cd apps/core/cardbey-core
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); console.log('miArtifact:', 'miArtifact' in p ? 'EXISTS' : 'MISSING');"
```

**Check schema for MiArtifact:**
```powershell
cd apps/core/cardbey-core
Select-String -Path "prisma/schema.prisma" -Pattern "MiArtifact" -CaseSensitive
```

**Verify guards in code:**
```powershell
cd apps/core/cardbey-core
Select-String -Path "src/routes/miRoutes.js" -Pattern "prisma\.miArtifact" -Context 2
```

**Regenerate Prisma client (if model is added):**
```powershell
cd apps/core/cardbey-core
npx prisma generate
```

---

## 10. Conclusion

**Root Cause:** `prisma.miArtifact` is `undefined` because the `MiArtifact` model does not exist in the Prisma schema, and therefore is not included in the generated Prisma client.

**Current State:** The codebase has proper guards (`if (prisma.miArtifact)`) that should prevent crashes. The error at line 855 is likely from an older code version before guards were added.

**Recommendation:** 
- If error persists: Restart server and verify latest code is deployed
- If MiArtifact is needed: Add model to schema and migrate (Option B)
- If MiArtifact is not needed: Keep current guards (Option A)










