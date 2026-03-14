# Quick Fix Implementation Guide
**Priority:** P0 - Critical Issues  
**Estimated Time:** 1-2 hours

---

## Issue #1: Fix MI Routes False Positive Detection

### Problem
Frontend incorrectly shows "MI routes unavailable" for any 404 error, even when MI routes are working.

### Location
`apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts:974`

### Fix
```typescript
// BEFORE (line 974):
if (httpStatus === 404) {
  friendlyMessage = 'Store generation is currently unavailable. The MI (Marketing Intelligence) routes are not configured in the Core backend. Please contact your administrator or check the System Health panel for details.';
  errorCode = 'MI_ROUTES_UNAVAILABLE';
}

// AFTER:
// Only flag as MI unavailable if the error specifically indicates it
if (httpStatus === 404 && (
  errorBody?.error?.code === 'MI_ROUTES_UNAVAILABLE' ||
  errorBody?.error?.message?.includes('MI routes') ||
  errorBody?.error?.message?.includes('orchestra') ||
  apiError.message?.includes('/api/mi/')
)) {
  friendlyMessage = 'Store generation is currently unavailable. The MI (Marketing Intelligence) routes are not configured in the Core backend. Please contact your administrator or check the System Health panel for details.';
  errorCode = 'MI_ROUTES_UNAVAILABLE';
} else if (httpStatus === 404) {
  friendlyMessage = 'The requested resource was not found. Please check the URL and try again.';
  errorCode = 'NOT_FOUND';
}
```

### Verification
1. Test with valid MI request → Should not show "MI unavailable"
2. Test with actual MI route 404 → Should show "MI unavailable"
3. Test with other 404s → Should show generic "not found"

---

## Issue #2: Verify Stub Router Mounting

### Problem
Missing degradable routes should mount stubs returning 501, but need verification.

### Test Steps
```bash
# 1. Start server
cd apps/core/cardbey-core
npm run dev

# 2. Test missing route (should return 501)
curl http://localhost:3001/api/smart-objects/test
# Expected: {"ok":false,"error":"FEATURE_NOT_AVAILABLE","feature":"smartObjectRoutes",...}

# 3. Check capabilities
curl http://localhost:3001/api/capabilities
# Expected: "smartObjectRoutes": {"status":"degraded",...}
```

### If Stubs Don't Work
Check `loadOptionalRoute` function in `src/server.js` around line 783:
- Verify `stubFactory` is called when import fails
- Verify stub router is mounted
- Check console logs for "[routes] smartObjectRoutes mounted as degraded (stub)"

---

## Issue #3: Create Missing Route Stubs (Optional)

### Problem
Some routes are missing but should degrade gracefully.

### Option A: Verify Existing Stubs Work
If stubs are mounting correctly, no action needed.

### Option B: Create Minimal Route Files
Create minimal route files for missing routes:

**File:** `apps/core/cardbey-core/src/routes/promoRoutes.js`
```javascript
import express from 'express';
const router = express.Router();

// Minimal stub - returns 501 for all requests
router.use((req, res) => {
  res.status(501).json({
    ok: false,
    error: 'FEATURE_NOT_AVAILABLE',
    feature: 'promoRoutes',
    message: 'Promo routes are not available in this deployment',
  });
});

export default router;
```

**File:** `apps/core/cardbey-core/src/routes/smartObjectRoutes.js`
```javascript
import express from 'express';
const router = express.Router();

router.use((req, res) => {
  res.status(501).json({
    ok: false,
    error: 'FEATURE_NOT_AVAILABLE',
    feature: 'smartObjectRoutes',
    message: 'Smart Object routes are not available in this deployment',
  });
});

export default router;
```

**File:** `apps/core/cardbey-core/src/routes/menuImagesRoutes.js`
```javascript
import express from 'express';
const router = express.Router();

router.use((req, res) => {
  res.status(501).json({
    ok: false,
    error: 'FEATURE_NOT_AVAILABLE',
    feature: 'menuImagesRoutes',
    message: 'Menu Images routes are not available in this deployment',
  });
});

export default router;
```

---

## Issue #4: Test Critical Endpoints

### Test Script
```bash
#!/bin/bash
BASE_URL="http://localhost:3001"

echo "Testing Health Endpoint..."
curl -s "$BASE_URL/api/health" | jq '.'

echo -e "\nTesting Capabilities Endpoint..."
curl -s "$BASE_URL/api/capabilities" | jq '.'

echo -e "\nTesting MI Orchestrator Start..."
curl -s -X POST "$BASE_URL/api/mi/orchestra/start" \
  -H "Content-Type: application/json" \
  -d '{"entryPoint":"build_store","request":{"goal":"test"}}' | jq '.'

echo -e "\nTesting Missing Route (should return 501)..."
curl -s "$BASE_URL/api/smart-objects/test" | jq '.'
```

### Expected Results
- Health: `{"ok":true,...}`
- Capabilities: `{"ok":true,"capabilities":{...}}`
- MI Start: `{"ok":true,"jobId":"..."}` or error with specific code
- Missing Route: `{"ok":false,"error":"FEATURE_NOT_AVAILABLE",...}`

---

## Issue #5: Fix BrowserRouter (Already Fixed)

### Status
✅ **ALREADY FIXED** in `apps/dashboard/cardbey-marketing-dashboard/src/main.jsx`

The singleton pattern prevents double initialization. No action needed unless error persists.

---

## Implementation Order

1. **Fix MI Routes Detection** (15 min) - P0
2. **Test Stub Mounting** (15 min) - P1
3. **Test Critical Endpoints** (15 min) - P1
4. **Create Missing Stubs** (30 min) - P2 (if needed)

**Total Time:** 1-2 hours

---

## Verification Checklist

After fixes:
- [ ] Server boots with missing routes
- [ ] `/api/health` returns 200
- [ ] `/api/capabilities` lists route status
- [ ] `/api/mi/orchestra/start` works
- [ ] Missing routes return 501 (not 404)
- [ ] Frontend doesn't show false "MI unavailable"
- [ ] Dashboard builds successfully
- [ ] QuickStart flow completes

---

**Ready to implement?** Start with Issue #1 (MI Routes Detection) as it's the highest priority.

