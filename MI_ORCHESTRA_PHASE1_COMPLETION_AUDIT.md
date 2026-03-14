# MI Orchestra Phase 1 Completion Audit

**Date:** 2026-01-06  
**Auditor:** Senior Full-Stack Engineer  
**Scope:** End-to-end audit of MI Orchestra pipeline for Phase 1 milestones

---

## Executive Summary

**Overall Readiness Score: 6.5/10**

| Milestone | Score | Status |
|-----------|-------|--------|
| **#1: Store generator end-to-end** | **7/10** | 🟡 **FIXED** - Critical schema mismatch bug fixed, needs verification |
| **#2: Publish store to public page** | **8/10** | 🟡 **READY** - Implementation exists, needs verification |
| **#3: Convert store item to SmartObject** | **7/10** | 🟡 **READY** - Core flow works, MI chat binding needs verification |
| **#4: Complete MI process** | **7/10** | 🟡 **READY** - SSE works, health checks need integration |

**Critical Finding:** Routing plan schema mismatch causes `sync_store` to appear missing even when present in `stageModes`. ✅ **FIXED** - Applied schema fix to support both `payloadJson` (MiArtifact) and `contentJson` (ActivityEvent).

---

## A. STOP-THE-LINE Issues (Must Fix for Milestone #1)

### Issue #1: Routing Plan Schema Mismatch (CRITICAL)

**Severity:** 🔴 **CRITICAL** - Blocks job completion  
**Evidence:** 
- Error: `"sync_store stage missing from routing plan"` at `stageRunner.js:1994`
- Logs show `stageModes` includes `sync_store`, but validation fails
- Root cause: Schema field mismatch between storage and loading

**Root Cause:**
```javascript
// STORAGE (orchestraRoutingPlan.js:428) - CORRECT
payloadJson: routingPlan  // ✅ Stores in payloadJson

// LOADING (orchestraRoutingPlan.js:280) - WRONG
const plan = typeof existingPlan.contentJson === 'string'  // ❌ Reads from contentJson
```

**Schema Reality:**
- `MiArtifact` model (schema.prisma:1091): Has `payloadJson Json?` field (NO `contentJson`)
- `ActivityEvent` payload: Uses `contentJson` (correct for fallback)

**Impact:**
1. When routing plan is stored in `MiArtifact`, it's saved in `payloadJson` ✅
2. When loading from `MiArtifact`, code reads `contentJson` which is `undefined` ❌
3. Code thinks plan doesn't exist, recomputes it (may lose `sync_store` in edge cases)
4. OR: Plan is loaded from ActivityEvent fallback, but if that fails, plan is missing

**File References:**
- `apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js:280` - Reads wrong field
- `apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js:428` - Stores correctly
- `apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js:207-214` - MiArtifact query
- `apps/core/cardbey-core/prisma/schema.prisma:1091` - MiArtifact schema (payloadJson only)

**Fix:** ✅ **APPLIED**
```diff
--- a/apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js
+++ b/apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js
@@ -279,7 +279,15 @@ export async function getOrCreateRoutingPlan(jobId, job) {
   if (existingPlan) {
-    const plan = typeof existingPlan.contentJson === 'string'
-      ? JSON.parse(existingPlan.contentJson)
-      : existingPlan.contentJson;
+    // CRITICAL: MiArtifact uses payloadJson, ActivityEvent uses contentJson
+    // Support both for backward compatibility
+    const planData = existingPlan.payloadJson || existingPlan.contentJson;
+    if (!planData) {
+      console.warn(`[Orchestra Routing] Routing plan found but no data (payloadJson/contentJson missing) for job ${jobId}`);
+      // Fall through to recompute
+    } else {
+      const plan = typeof planData === 'string'
+        ? JSON.parse(planData)
+        : planData;
       
       console.log(`[Orchestra Routing] Using existing routing plan for job ${jobId}`);
       return plan;
+    }
   }
```

**Also Fixed:** `recordFallback()` function (line 596) - same schema mismatch issue

**Test:**
```bash
# 1. Create job
curl -X POST http://localhost:3001/api/mi/orchestra/start \
  -H "Content-Type: application/json" \
  -d '{"goal": "build_store", "rawInput": "Create a coffee shop"}'

# 2. Verify routing plan is stored correctly
# Check MiArtifact table: SELECT payloadJson FROM MiArtifact WHERE provenanceAgent='OrchestraRouting'

# 3. Verify routing plan loads correctly
# Check logs for: "[Orchestra Routing] Using existing routing plan for job {jobId}"
# Verify stageModes includes sync_store

# 4. Run job and verify sync_store executes
curl -X POST http://localhost:3001/api/mi/orchestra/job/{jobId}/run

# Expected: Job completes with all 6 stages including sync_store
```

---

### Issue #2: validate_semantics "Illegal return statement" (VERIFY)

**Severity:** 🟡 **MEDIUM** - May block validation stage  
**Evidence:** User reported "Illegal return statement" error in validate_semantics  
**Status:** ⚠️ **VERIFY** - Code structure appears correct, may be stale error

**Investigation:**
- Searched for "Illegal return" / "return outside" - No matches found
- `SemanticValidatorAgent.js`: All return statements are inside functions ✅
- `stageRunner.js:1370`: Comment says "Return success" but code assigns to `result` and uses `break` ✅

**Possible Sources:**
1. Stale error from previous code version
2. Syntax error in imported module (check at runtime)
3. Top-level return in a different file

**Action Required:**
- Run validate_semantics stage and capture exact error message + stack trace
- Check if error occurs during module import (line 1308) or execution (line 1340)

**File References:**
- `apps/core/cardbey-core/src/services/orchestra/stageRunner.js:1261-1385` - validate_semantics case
- `apps/core/cardbey-core/src/services/orchestra/agents/SemanticValidatorAgent.js` - Agent implementation

**Test:**
```bash
# Enable validation
export ORCHESTRA_VALIDATE_SEMANTICS=true

# Create and run job
# Check logs for validate_semantics execution
# If error occurs, capture full stack trace
```

---

### Issue #3: Frontend Polling Storm Risk (MEDIUM)

**Severity:** 🟡 **MEDIUM** - Performance issue, not blocking  
**Evidence:** User reported "repeated GET /api/mi/orchestra/job/:id calls"

**Investigation:**
- `useJobPoll.ts`: Has exponential backoff (2s → 4s → 8s → 15s max) ✅
- `useJobPoll.ts:73`: Rate limiter `MIN_POLL_INTERVAL_MS = 2000` ✅
- `useJobPoll.ts:64`: `isPollingRef` prevents overlapping requests ✅
- `StoreDraftReview.tsx:456-589`: Additional polling logic (may conflict)

**Root Cause:**
- Multiple polling implementations may run simultaneously
- `useJobPoll` hook + `StoreDraftReview` custom polling = potential duplicate requests

**File References:**
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts:53-694` - Main polling hook
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx:456-589` - Custom polling

**Fix Recommendation:**
- Ensure `StoreDraftReview` uses `useJobPoll` hook instead of custom polling
- OR: Add global polling registry to prevent duplicate watchers

**Test:**
```javascript
// In browser console (Network tab):
// 1. Create job via QuickStart
// 2. Monitor GET /api/mi/orchestra/job/:id requests
// 3. Verify: Max 1 request per 2 seconds
// 4. Verify: Polling stops when SSE connects
// 5. Verify: Polling stops when job reaches terminal status
```

---

## B. High/Medium Backlog Items

### Milestone #2: Publish Store to Public Page

| Issue | Severity | Effort | Evidence | Fix |
|-------|----------|--------|----------|-----|
| Verify public route `/s/{slug}` accessibility | Medium | 1h | Route exists in `publicStoreRoutes.js`, needs smoke test | Test route with curl + browser |
| Ensure `isActive=true` sets correct visibility | Medium | 2h | `stores.js:1373` sets `isActive=true`, verify public filtering | Check `publicStoreRoutes.js` filters by `isActive` |
| Test storefront URL generation | Low | 1h | `stores.js:1404` returns `storefrontUrl: /s/{slug}` | Verify slug generation is deterministic |

**Files:**
- `apps/core/cardbey-core/src/routes/stores.js:1289-1410` - Publish endpoint
- `apps/core/cardbey-core/src/routes/publicStoreRoutes.js:28-194` - Public route
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/PublicStorePage.tsx` - Frontend page

---

### Milestone #3: Convert Store Item to SmartObject

| Issue | Severity | Effort | Evidence | Fix |
|-------|----------|--------|----------|-----|
| Verify SmartObject creation from product | Medium | 2h | `smartObjectRoutes.js:438-671` - Creation endpoint exists | Integration test |
| Test QR code generation and URL format | Medium | 2h | `smartObjectRoutes.js:657` returns `qrUrl: {PUBLIC_BASE_URL}/q/{publicCode}` | Verify `PUBLIC_BASE_URL` is set |
| Verify scan landing page loads | Medium | 3h | `smartObjectRoutes.js:110-354` - Landing endpoint exists | Test `/q/:publicCode` route |
| Bind MI chat to SmartObject context | High | 4h | `miRoutes.js:1894-1967` - Chat endpoint exists, verify `objectId` format | Test with `objectId: "smartobject:{id}"` |

**Files:**
- `apps/core/cardbey-core/src/routes/smartObjectRoutes.js:438-671` - Creation
- `apps/core/cardbey-core/src/routes/smartObjectRoutes.js:110-354` - Landing
- `apps/core/cardbey-core/src/routes/miRoutes.js:1894-1967` - MI chat
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/PrintBagLandingPage.tsx` - Frontend landing

---

### Milestone #4: Complete MI Process

| Issue | Severity | Effort | Evidence | Fix |
|-------|----------|--------|----------|-----|
| Fix MI routes health check ("unknown" status) | Medium | 2h | `DashboardEnhanced.jsx:887-929` - Custom check, not integrated into system health | Add `checkMiRoutes()` to `systemHealthClient.ts` |
| Verify SSE stream health endpoint | Low | 1h | `/api/stream/health` exists (`sse.routes.js:145`), needs integration | Already integrated in `systemHealthClient.ts:328` ✅ |
| Test job-specific SSE subscriptions | Medium | 3h | `useJobPoll.ts:60-61` - SSE refs exist, verify connection | Test SSE connection with `key=job:{jobId}` |
| Consolidate chat widgets | High | 8h | Multiple chat UIs exist (MiConsole, AskCardbey, MI landing) | Architectural decision needed |

**Files:**
- `apps/core/cardbey-core/src/routes/miRoutes.js:31-52` - MI health endpoint
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/DashboardEnhanced.jsx:887-929` - Custom MI health check
- `apps/dashboard/cardbey-marketing-dashboard/src/api/systemHealthClient.ts` - System health client (missing MI routes check)

---

## C. Canonical Routing Plan Schema

**Proposed Schema (JSON):**
```json
{
  "jobId": "cmk2bkxd40000jvnsqs0yzmb8",
  "computedAt": "2026-01-06T08:20:00.000Z",
  "baseDecision": {
    "useAI": false,
    "reason": "Guest user - using templates to avoid costs",
    "estimatedCost": 0,
    "fallbackEnabled": true
  },
  "stageModes": {
    "analyze_business_type": "template",
    "generate_catalog": "template",
    "assign_visuals": "template",
    "validate_semantics": "template",
    "sync_store": "template",
    "generate_promo": "template"
  },
  "totalEstimatedCost": 0,
  "budgetLimit": null,
  "circuitBreakerState": {
    "state": "CLOSED",
    "failures": 0
  },
  "overrides": {}
}
```

**Storage Locations:**
1. **MiArtifact** (primary): `payloadJson` field (schema.prisma:1091)
2. **ActivityEvent** (fallback): `payload.contentJson` field

**Loading Logic:**
```javascript
// CRITICAL: Support both payloadJson (MiArtifact) and contentJson (ActivityEvent)
const planData = existingPlan.payloadJson || existingPlan.contentJson;
const plan = typeof planData === 'string' ? JSON.parse(planData) : planData;
```

**Consistency Rules:**
- `stageModes` is always an object (never array)
- `stageModes` keys are stage names (e.g., "sync_store")
- `stageModes` values are "ai" | "template" | "off"
- `sync_store` must always be present in `stageModes` for `build_store` goal

---

## D. Verification Checklist

### Milestone #1: Store Generator End-to-End

#### Test 1: Create Job and Verify Routing Plan
```bash
# Create job
curl -X POST http://localhost:3001/api/mi/orchestra/start \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "build_store",
    "rawInput": "Create a coffee shop store",
    "inputsJson": {
      "storeName": "Test Coffee Shop",
      "businessTypeHint": "coffee"
    }
  }'

# Save jobId from response
# Expected: { "ok": true, "jobId": "..." }

# Verify routing plan stored correctly
# Check database:
sqlite3 dev.db "SELECT payloadJson FROM MiArtifact WHERE provenanceAgent='OrchestraRouting' AND jobId='{jobId}' ORDER BY createdAt DESC LIMIT 1;"

# Expected: JSON with stageModes including "sync_store": "template"
```

#### Test 2: Verify Routing Plan Loading
```bash
# Check backend logs for:
# "[Orchestra Routing] Using existing routing plan for job {jobId}"
# Verify stageModes includes sync_store

# Run job
curl -X POST http://localhost:3001/api/mi/orchestra/job/{jobId}/run

# Expected: Job executes all 6 stages including sync_store
```

#### Test 3: Monitor Job Progress (SSE)
```bash
# Open SSE stream
curl -N http://localhost:3001/api/stream?key=job:{jobId}

# Expected events:
# - orchestra.job_started
# - orchestra.stage_started (for each stage)
# - orchestra.stage_completed (for each stage)
# - orchestra.job_completed
```

#### Test 4: Verify Job Completion
```bash
# Check job status
curl http://localhost:3001/api/mi/orchestra/job/{jobId}

# Expected:
# {
#   "ok": true,
#   "job": {
#     "status": "COMPLETED",
#     "progress": 100
#   }
# }
```

#### Test 5: Verify Products Created
```bash
# Get products (use storeId from job.inputsJson.storeId)
curl http://localhost:3001/api/products?storeId={storeId}

# Expected: Array of products with name, price, imageUrl
# Count > 0
```

**Acceptance Criteria:**
- ✅ Routing plan loads correctly (no schema mismatch)
- ✅ All 6 stages complete (including sync_store)
- ✅ Products created in DB (count > 0)
- ✅ No duplicate job executions
- ✅ No polling storms (max 1 req/2s)

---

### Milestone #2: Publish Store to Public Page

#### Test 1: Publish Store
```bash
curl -X POST http://localhost:3001/api/store/publish \
  -H "Content-Type: application/json" \
  -d '{"storeId": "{storeId}"}'

# Expected:
# {
#   "ok": true,
#   "publishedStoreId": "...",
#   "storefrontUrl": "/s/{slug}"
# }
```

#### Test 2: Verify Public Route
```bash
# Access public store (no auth)
curl http://localhost:3001/api/public/store/{storeId}/draft

# Expected: Store data with products
# Note: If store is published (isActive=true), may return 403
```

#### Test 3: Verify Storefront URL
```bash
# Navigate to: http://localhost:5174/s/{slug}
# Expected: PublicStorePage loads with store name, products, visuals
```

---

### Milestone #3: Convert Store Item to SmartObject

#### Test 1: Create SmartObject
```bash
curl -X POST http://localhost:3001/api/smart-objects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "storeId": "{storeId}",
    "productId": "{productId}",
    "type": "bag"
  }'

# Expected:
# {
#   "ok": true,
#   "smartObject": {
#     "publicCode": "abc123",
#     "qrUrl": "http://localhost:5174/q/abc123"
#   }
# }
```

#### Test 2: Test QR Scan Landing
```bash
curl http://localhost:3001/api/smart-objects/q/{publicCode}

# Expected: Landing payload with store, product, promo, theme
```

#### Test 3: Test MI Chat Integration
```bash
curl -X POST http://localhost:3001/api/mi/chat \
  -H "Content-Type: application/json" \
  -d '{
    "objectId": "smartobject:{smartObjectId}",
    "messages": [{"role": "user", "content": "What is this product?"}],
    "context": {"surface": "qr_landing", "device": {"type": "mobile"}}
  }'

# Expected: Chat response with product context
```

---

### Milestone #4: Complete MI Process

#### Test 1: Verify System Health Panel
```bash
curl http://localhost:3001/api/health?full=true

# Expected:
# {
#   "api": "up",
#   "database": "up",
#   "scheduler": "up",
#   "sse": "up",
#   "oauth": "up" or "down"
# }
```

#### Test 2: Verify MI Routes Health
```bash
curl http://localhost:3001/api/mi/health

# Expected:
# {
#   "ok": true,
#   "service": "mi",
#   "routes": {...}
# }
```

#### Test 3: Verify SSE Stream Health
```bash
curl http://localhost:3001/api/stream/health

# Expected: SSE stream with Content-Type: text/event-stream
```

#### Test 4: Test Job-Specific SSE Subscription
```bash
# In browser console (Network tab):
# 1. Create job via QuickStart
# 2. Verify SSE connection to /api/stream?key=job:{jobId}
# 3. Verify polling stops when SSE connects
# 4. Verify job progress updates via SSE events
```

---

## E. Additional Findings

### Architecture Observations

1. **Persistence Fallback System:** Well-designed fallback from Prisma → ActivityEvent → in-memory
2. **Idempotency Guards:** Multiple layers (runningJobs Map, completion markers, double-run guard)
3. **Stage Dependencies:** Properly enforced via `dependsOnJson` and topological scheduling
4. **SSE Event System:** Well-structured with job-specific keys (`job:{jobId}`)

### Potential Issues (Non-Blocking)

1. **Multiple Chat Widgets:** 5+ chat implementations exist - consider consolidation
2. **Health Check Integration:** MI routes health not integrated into system health panel
3. **Public Store Route:** Needs verification that `/s/{slug}` is accessible without auth
4. **SmartObject Context Binding:** MI chat `objectId` format needs verification

---

## F. Recommended Action Plan

### Immediate (Blocking Milestone #1)
1. ✅ **FIX CRITICAL:** Apply routing plan schema fix (Issue #1)
2. ⚠️ **VERIFY:** Test validate_semantics stage execution (Issue #2)
3. 🔄 **TEST:** Run verification checklist for Milestone #1

### Short-term (Milestones #2-#3)
1. Verify public store route accessibility
2. Test SmartObject creation and scan flow
3. Verify MI chat object-aware context binding
4. Add integration tests for critical paths

### Medium-term (Milestone #4)
1. Integrate MI routes health into system health panel
2. Consolidate chat widgets (architectural decision)
3. Add comprehensive E2E tests

---

## G. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Routing plan schema mismatch blocks jobs | **Low** | **Critical** | ✅ **FIXED** - Applied schema fix (Issue #1) |
| validate_semantics syntax error | Medium | High | Verify and fix if present |
| Frontend polling storm | Medium | Medium | Consolidate polling logic |
| Public store route not accessible | Low | Medium | Verification test (1h) |
| MI chat context binding incorrect | Medium | Medium | Integration test (2h) |

---

## Conclusion

**Overall Status:** 🟡 **YELLOW** - Core pipeline functional, critical schema bug fixed, needs verification

**Confidence in Milestone #1 Completion:** 85% (after Issue #1 fix applied)  
**Estimated Time to Fix Remaining Issues:** 1-2 hours (verification + any validate_semantics fix if needed)  
**Estimated Time to Complete All Milestones:** 20-30 hours

**Patches Applied:**
1. ✅ **FIXED** - Routing plan schema mismatch (Issue #1) - Applied fix to support both `payloadJson` and `contentJson`
2. ✅ **FIXED** - Same fix applied to `recordFallback()` function
3. ⚠️ **VERIFY** - validate_semantics "Illegal return statement" (Issue #2) - Code structure appears correct, needs runtime verification

**Next Steps:**
1. ✅ Routing plan schema fix applied
2. 🔄 Run verification checklist (Test 1-5 for Milestone #1)
3. Verify validate_semantics stage execution (if error persists, investigate)
4. Proceed to milestones #2-#4 once #1 is stable

---

**Report Generated:** 2026-01-06  
**Files Audited:** 50+ files across Orchestra, routes, and dashboard

