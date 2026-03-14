# QuickStart Fix Inventory - 2026-01-15

## A) CANONICAL BACKEND ROUTES

### MI Routes (mounted at `/api/mi`)
- ✅ `POST /api/mi/orchestra/infer` - exists, returns 500 (needs fix)
- ✅ `POST /api/mi/orchestra/start` - exists, works
- ✅ `GET /api/mi/orchestra/job/:jobId` - exists
- ✅ `POST /api/mi/orchestra/job/:jobId/run` - exists
- ✅ `POST /api/mi/orchestra/job/:jobId/sync-store` - exists
- ❌ `POST /api/mi/orchestra/job/:jobId` - does NOT exist (frontend expects this)

### Draft Store Routes
- ✅ `GET /api/draft-store/:draftId` - exists
- ✅ `POST /api/draft-store/:draftId/commit` - exists
- ❌ `GET /api/stores/:storeId/draft` - does NOT exist (frontend expects this)
- ❌ `GET /api/public/store/:storeId/draft` - does NOT exist (frontend expects this)

### Flags Routes
- ✅ `GET /api/v2/flags` - exists (just created)

### Legacy/Deprecated Routes (frontend still calls)
- ❌ `POST /api/mi/infer` - does NOT exist (frontend calls this)
- ❌ `POST /api/mi/start` - does NOT exist (frontend calls this)
- ✅ `GET /api/mi/orchestrator/templates/suggestions` - exists (compat shim already in place)

---

## B) FRONTEND CALLERS

### quickStart.ts
- Calls: `POST /api/mi/orchestra/infer` ✅ (correct)
- Calls: `POST /api/mi/orchestra/start` ✅ (correct)
- Calls: `POST /api/mi/orchestra/job/:jobId/run` ✅ (correct)
- Calls: `POST /api/mi/orchestra/job/:jobId/sync-store` ✅ (correct)

### StoreReviewPage.tsx
- Calls: `GET /api/stores/:id/draft` ❌ (needs compat route)
- Calls: `GET /api/public/store/:id/draft` ❌ (needs compat route)

### StoreDraftReview.tsx
- Calls: `POST /api/mi/orchestra/job/:jobId` ❌ (needs compat route - should forward to /run or /sync-store based on body)

---

## C) ISSUES TO FIX

1. **500 on POST /api/mi/orchestra/infer** - Error handling issue, likely missing config
2. **404 on POST /api/mi/orchestra/job/:jobId** - Frontend expects this, backend doesn't have it
3. **404 on GET /api/stores/:storeId/draft** - Needs compatibility route
4. **404 on GET /api/public/store/:storeId/draft** - Needs compatibility route
5. **Frontend import errors** - SoftAuthPrompt, useGatekeeper, draftHero paths need fixing

---

## D) IMPLEMENTATION PLAN

### Step 1: Add Compatibility Shims (Backend)
1. `POST /api/mi/infer` → forward to `POST /api/mi/orchestra/infer`
2. `POST /api/mi/start` → forward to `POST /api/mi/orchestra/start`
3. `POST /api/mi/orchestra/job/:jobId` → forward to `/run` or `/sync-store` based on body
4. `GET /api/stores/:storeId/draft` → forward to `/api/draft-store/by-store/:storeId` or create draft lookup
5. `GET /api/public/store/:storeId/draft` → same as above but public access

### Step 2: Fix 500 on /infer
- Add try/catch with proper error handling
- Return typed error response instead of crashing

### Step 3: Fix Frontend Imports
- Verify SoftAuthPrompt path
- Verify useGatekeeper path
- Verify draftHero path
- Create re-exports if needed

---

## E) TESTING CHECKLIST

- [ ] `curl -X POST http://localhost:3001/api/mi/infer` → 200 or typed error
- [ ] `curl -X POST http://localhost:3001/api/mi/start` → 200 or typed error
- [ ] `curl -X POST http://localhost:3001/api/mi/orchestra/job/:jobId` → 200 or typed error
- [ ] `curl http://localhost:3001/api/stores/:storeId/draft` → 200 with draft
- [ ] `curl http://localhost:3001/api/public/store/:storeId/draft` → 200 with draft
- [ ] `curl http://localhost:3001/api/v2/flags` → 200 with flags
- [ ] QuickStart flow: Generate → Review page loads → No 404s

