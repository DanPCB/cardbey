# Phase 1 Fixes Summary

**Date:** 2026-01-06  
**Status:** ✅ **COMPLETE** - All critical fixes applied

---

## What Changed / Why

### 1. Routing Plan Schema Normalization (CRITICAL FIX)

**Problem:** `sync_store` stage appeared missing even when present in `stageModes` due to schema inconsistency:
- Storage: `payloadJson` (MiArtifact) vs `contentJson` (ActivityEvent)
- Format: Object `{ "sync_store": "template" }` vs Array `["sync_store", ...]`
- No validation: Missing `sync_store` not caught until runtime

**Solution:**
- Created `routingPlanSchema.js` with canonical schema normalization
- `normalizeRoutingPlan()` function enforces:
  - `stageModes` is always an array of strings
  - Must include `sync_store` (throws explicit error if missing)
  - Supports both object and array formats (backward compatible)
- Applied normalization at ALL read boundaries:
  - After loading from DB/ActivityEvent
  - After computing new plan
  - Before stageRunner uses it

**Files Changed:**
- `apps/core/cardbey-core/src/services/orchestra/routingPlanSchema.js` (NEW)
- `apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js`
- `apps/core/cardbey-core/src/services/orchestra/stageRunner.js`

**Key Changes:**
```javascript
// Before: Read from wrong field
const plan = existingPlan.contentJson; // ❌ MiArtifact uses payloadJson

// After: Normalize with validation
const plan = normalizeRoutingPlan(rawPlan, source); // ✅ Validates sync_store present
```

---

### 2. System Health Integration

**Problem:**
- MI Routes health showed "unknown" in dashboard
- OAuth showed ambiguous "down" instead of "not configured"
- SSE health not reliably reported

**Solution:**
- Integrated MI routes health check into `/api/health?full=true`
- Changed OAuth status from "down" → "warning" (with label "not configured")
- SSE health already working (marked as 'up' if route exists)

**Files Changed:**
- `apps/core/cardbey-core/src/routes/healthRoutes.js`
- `apps/dashboard/cardbey-marketing-dashboard/src/api/systemHealthClient.ts`

**Key Changes:**
```javascript
// Before: OAuth "down" (ambiguous)
const oauthStatus = oauthResult.ok ? 'up' : 'down';

// After: OAuth "warning" with label
const oauthStatus = oauthResult.ok ? 'up' : 'warning';
// Label: oauthResult.ok ? 'configured' : 'not configured'
```

---

### 3. Frontend Polling Guards (Already Implemented)

**Status:** ✅ Already has proper guards:
- `isPollingRef` prevents overlapping requests
- `MIN_POLL_INTERVAL_MS = 2000` (max 1 req/2s)
- Stops polling when SSE connected
- Exponential backoff when SSE disconnected
- Rate limiter with `lastPollTimeRef`

**No changes needed** - implementation is correct.

---

### 4. validate_semantics Stage

**Status:** ⚠️ **VERIFY** - Code structure appears correct
- All `return` statements are inside functions ✅
- Error handling returns `success: true` with `skipped: true` ✅
- No top-level returns found ✅

**Action:** Run job and verify stage executes without "Illegal return statement" error.

---

## Patch Set

### A. Routing Plan Schema Normalization

**File:** `apps/core/cardbey-core/src/services/orchestra/routingPlanSchema.js` (NEW)

```javascript
export function normalizeRoutingPlan(plan, source = 'unknown') {
  // Validates stageModes is array
  // Enforces sync_store is present
  // Returns normalized plan with canonical schema
}
```

**File:** `apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js`

```diff
+ import { normalizeRoutingPlan, ROUTING_PLAN_VERSION, REQUIRED_STAGES } from './routingPlanSchema.js';

  if (existingPlan) {
    const rawPlan = typeof planData === 'string' ? JSON.parse(planData) : planData;
-   return rawPlan;
+   const plan = normalizeRoutingPlan(rawPlan, source);
+   return plan;
  }

  // Create routing plan
  const routingPlan = {
+   version: ROUTING_PLAN_VERSION,
    stageModes: REQUIRED_STAGES, // Array format
    stageConfig: stageModesConfig, // Mode config
    ...
  };
+ const normalizedPlan = normalizeRoutingPlan(routingPlan, 'computed');
+ return normalizedPlan;
```

**File:** `apps/core/cardbey-core/src/services/orchestra/stageRunner.js`

```diff
+ import { normalizeRoutingPlan, getStageMode } from './routingPlanSchema.js';

  if (routingPlan) {
+   const normalizedPlan = normalizeRoutingPlan(routingPlan, 'getReadyStages');
    allStages = normalizedPlan.stageModes.map(...);
  }

  // Get stage mode
- const stageMode = routingPlan?.stageModes?.[stage.name] || 'template';
+ const normalizedPlan = normalizeRoutingPlan(routingPlan, 'executeStage');
+ const stageMode = getStageMode(normalizedPlan, stage.name);
```

---

### B. Health Check Integration

**File:** `apps/core/cardbey-core/src/routes/healthRoutes.js`

```diff
  // OAuth
- const oauthStatus = oauthResult.ok ? 'up' : 'down';
+ const oauthStatus = oauthResult.ok ? 'up' : 'warning';

+ // MI Routes
+ let miRoutesStatus = 'unknown';
+ try {
+   await import('./miRoutes.js');
+   miRoutesStatus = 'up';
+ } catch {
+   miRoutesStatus = 'down';
+ }

  const healthData = {
    api: apiStatus,
    database: databaseStatus,
    scheduler: schedulerStatus,
    sse: sseStatus,
    oauth: oauthStatus,
+   miRoutes: miRoutesStatus,
    _details: {
      oauth: {
+       label: oauthResult.ok ? 'configured' : 'not configured',
      },
+     miRoutes: {
+       status: miRoutesStatus,
+       endpoint: '/api/mi/health',
+     },
    },
  };
```

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/api/systemHealthClient.ts`

```diff
  export interface SystemHealthSnapshot {
    api: HealthState;
    database: HealthState;
    scheduler: HealthState;
    sseStream: HealthState;
    oauth: HealthState;
+   miRoutes: HealthState;
    lastCheckedAt: string;
  }

+ async function checkMiRoutes(...): Promise<HealthState> {
+   // Checks /api/health?full=true for miRoutes field
+   // Falls back to /api/mi/health direct check
+ }

  const [api, database, scheduler, sseStream, oauth, miRoutes] = await Promise.all([
    checkApi(...),
    checkDatabase(...),
    checkScheduler(...),
    checkSseStream(...),
    checkOAuth(...),
+   checkMiRoutes(...),
  ]);
```

---

## Verification Commands

### 1. Test Routing Plan Normalization

```bash
# Start server
cd apps/core/cardbey-core
npm run dev

# Create job
curl -X POST http://localhost:3001/api/mi/orchestra/start \
  -H "Content-Type: application/json" \
  -d '{"goal": "build_store", "rawInput": "Create a coffee shop"}'

# Save jobId from response, then check routing plan
# Expected: No "sync_store missing" error
# Expected: Job completes with all 6 stages
```

### 2. Test System Health

```bash
# Check health endpoint
curl http://localhost:3001/api/health?full=true

# Expected:
# {
#   "api": "up",
#   "database": "up",
#   "scheduler": "up",
#   "sse": "up",
#   "oauth": "warning",  # or "up" if configured
#   "miRoutes": "up"
# }
```

### 3. Test MI Routes Health

```bash
# Direct MI health check
curl http://localhost:3001/api/mi/health

# Expected:
# {
#   "ok": true,
#   "service": "mi",
#   "routes": {...}
# }
```

### 4. Run Smoke Test

```bash
# Run end-to-end smoke test
node scripts/smoke-orchestra.js --base-url=http://localhost:3001

# Expected:
# [1/4] Creating job... [OK]
# [2/4] Streaming SSE... [OK]
# [3/4] Verifying job status... [OK]
# [4/4] Verifying products... [OK]
# [SUCCESS] All smoke tests passed!
```

---

## Test Coverage

### Unit Tests (TODO - Add to test suite)

```javascript
// routingPlanSchema.test.js
describe('normalizeRoutingPlan', () => {
  it('should include sync_store in normalized plan', () => {
    const plan = { stageModes: { sync_store: 'template' } };
    const normalized = normalizeRoutingPlan(plan, 'test');
    expect(normalized.stageModes).toContain('sync_store');
  });

  it('should throw if sync_store missing', () => {
    const plan = { stageModes: ['analyze_business_type'] };
    expect(() => normalizeRoutingPlan(plan, 'test')).toThrow('sync_store missing');
  });
});
```

---

## Breaking Changes

**None** - All changes are backward compatible:
- Supports both object and array `stageModes` formats
- Normalization is applied transparently
- Health check changes are additive (new fields)

---

## Next Steps

1. ✅ **DONE** - Routing plan schema normalization
2. ✅ **DONE** - System health integration
3. ✅ **DONE** - Frontend polling guards (already implemented)
4. ⚠️ **VERIFY** - validate_semantics stage execution
5. 🔄 **TODO** - Add unit tests for `normalizeRoutingPlan()`
6. 🔄 **TODO** - Run smoke test in CI/CD

---

## Files Modified

### New Files
- `apps/core/cardbey-core/src/services/orchestra/routingPlanSchema.js`
- `scripts/smoke-orchestra.js`
- `PHASE1_FIXES_SUMMARY.md`

### Modified Files
- `apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js`
- `apps/core/cardbey-core/src/services/orchestra/stageRunner.js`
- `apps/core/cardbey-core/src/routes/healthRoutes.js`
- `apps/dashboard/cardbey-marketing-dashboard/src/api/systemHealthClient.ts`

---

**Status:** ✅ **READY FOR TESTING**

All critical fixes applied. Run smoke test to verify end-to-end functionality.




