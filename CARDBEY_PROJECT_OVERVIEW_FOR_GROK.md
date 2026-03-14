# Cardbey Project Overview - For Grok AI Assistant

**Last Updated:** 2025-01-XX  
**Purpose:** Comprehensive onboarding document for AI assistants (Grok) to understand Cardbey project structure, current state, and active issues

---

## 🎯 Project Purpose

**Cardbey** is an AI-first platform for managing:
- **Loyalty programs** - Customer rewards and engagement
- **Digital menus** - Restaurant/store product catalogs
- **Digital signage** - TV/tablet displays for stores
- **Marketing campaigns** - Promotional content generation
- **Store management** - Business profiles, products, categories

**Core Philosophy:** "If anything can be done by AI, we will find and integrate the APIs. Manual is just an option."

---

## 📁 Project Structure

```
cardbey/
├── apps/
│   ├── core/cardbey-core/              # Backend API (Node.js, Express, Prisma)
│   │   ├── src/
│   │   │   ├── server.js               # Main Express server
│   │   │   ├── routes/                 # HTTP API endpoints
│   │   │   ├── services/               # Business logic services
│   │   │   ├── orchestrator/           # AI orchestration layer
│   │   │   ├── engines/                 # AI engines (Vision, Text, Content)
│   │   │   └── mi/                     # MI (Marketing Intelligence) system
│   │   └── prisma/
│   │       └── schema.prisma           # Database schema
│   │
│   └── dashboard/cardbey-marketing-dashboard/  # Frontend (React, Vite)
│       ├── src/
│       │   ├── pages/                  # Page components
│       │   ├── features/               # Feature modules
│       │   ├── hooks/                  # React hooks
│       │   └── lib/                    # Utilities (api.ts, etc.)
│       └── public/
│
├── packages/                            # Shared packages
│   └── api-client/                     # TypeScript API client
│
└── docs/
    └── DEVELOPMENT_PRINCIPLES.md        # ⭐ CRITICAL: Read first!
```

---

## 🏗️ Architecture Overview

### Backend (Cardbey Core)
- **Port:** 3001 (dev)
- **Tech Stack:** Node.js, Express, Prisma ORM, TypeScript/JavaScript
- **Database:** SQLite (dev) / PostgreSQL (prod)
- **Key Components:**
  - **Orchestrator:** AI workflow orchestration (`src/orchestrator/`)
  - **MI System:** Marketing Intelligence (`src/mi/`)
  - **Engines:** AI abstraction layer (`src/engines/`)
  - **Routes:** REST API endpoints (`src/routes/`)

### Frontend (Marketing Dashboard)
- **Port:** 5174 (dev)
- **Tech Stack:** React, Vite, TypeScript
- **Key Features:**
  - Store creation and management
  - Draft review and editing
  - Product/category management
  - Template selection
  - AI-powered content generation

### Data Flow
```
User Action (Frontend)
  ↓
API Request (api.ts)
  ↓
Backend Route (miRoutes.js, stores.js, etc.)
  ↓
Service Layer (orchestrator, services)
  ↓
AI Orchestration (plan_store, seed_catalog, etc.)
  ↓
Database (Prisma)
  ↓
Response → Frontend
```

---

## 🔄 Current Active Issues & Recent Fixes

### ✅ Recently Fixed (Last Session)

#### 1. **Store Draft Review Page - Polling & Rate Limiting**
**Status:** ✅ FIXED  
**Files Changed:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- `apps/core/cardbey-core/src/routes/miRoutes.js`
- `apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts`

**Issues Fixed:**
- ✅ Excessive polling causing `CLIENT_RATE_LIMIT` errors
- ✅ Repeated `sync-store` calls (now idempotent per `generationRunId`)
- ✅ Stuck spinner UI (now correctly shows "Generating..." vs "Loading...")
- ✅ `NS_BINDING_ABORTED` noise (handled silently)
- ✅ Backend TDZ error: `tenantId` accessed before initialization
- ✅ Backend Prisma error: `profileName` field doesn't exist in schema

**Key Changes:**
- Added single-flight request guard (`draftPollInFlightRef`)
- Exponential backoff on rate limits (500ms → 8000ms cap)
- Sync-store idempotency tracking (`syncAttemptedRef` Set)
- Terminal state checks (stop polling on `'ready'` or `'error'`)
- Normalized `'failed'` → `'error'` status on client

#### 2. **storeIntent TDZ Error**
**Status:** ✅ FIXED  
**File:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`

**Issue:** `storeIntent` accessed before initialization (Temporal Dead Zone error)

**Fix:**
- Destructured `storeIntent` from params immediately
- Added DEV guardrail to catch future regressions
- Enhanced error handling with `markDraftError` helper

---

## 🚨 Current Known Issues

### 1. **Draft Generation Pipeline Stability**
**Status:** 🟡 PARTIALLY FIXED  
**Priority:** HIGH

**Symptoms:**
- Draft endpoint sometimes returns `draftFound=false` when `DraftStore` exists
- `generationRunId` mismatches cause draft lookup failures
- `DraftStore.status='error'` but `lastError`/`lastErrorAt` may be null (should be fixed)

**Recent Fixes:**
- ✅ Draft lookup now has fallback logic (exact → latest → placeholder)
- ✅ `markDraftError` helper ensures error fields are always set
- ✅ Status normalization (`'failed'` → `'error'`)

**Remaining Work:**
- Monitor for edge cases where `DraftStore` creation fails
- Ensure `generationRunId` consistency across pipeline

### 2. **Sync-Store Error Handling**
**Status:** 🟡 IMPROVED  
**Priority:** MEDIUM

**Current State:**
- Returns HTTP 400 when catalog empty (job finished)
- Frontend handles 202 (generating) correctly
- Error response includes `code`, `error`, `message`, `details`

**Potential Improvement:**
- Consider HTTP 500 instead of 400 for server-side generation failures
- Or ensure frontend treats 400 as non-fatal when `code='CATALOG_EMPTY'`

### 3. **Product Suggestions Rate Limiting**
**Status:** ✅ FIXED  
**Priority:** LOW

**Fix Applied:**
- Fetches ONCE on mount
- 10-second cooldown
- In-flight guard prevents concurrent fetches
- Graceful fallback to local suggestions on rate limit

---

## 📋 Development Principles (CRITICAL)

### ⚠️ MUST READ: `docs/DEVELOPMENT_PRINCIPLES.md`

**Key Rules:**

1. **AI-First Development**
   - Prioritize AI integration (OpenAI, Anthropic, etc.)
   - Manual is fallback only

2. **User Journey Integrity**
   - **NEVER skip user-facing steps** in workflows
   - Each step serves a purpose
   - Optimize data/API calls, NOT UI steps

3. **Single Source of Truth**
   - No parallel implementations
   - No duplicate polling systems
   - One canonical flow per feature

4. **No Silent Fallbacks**
   - Log explicit reasons
   - Surface failures in UI
   - No hidden state changes

5. **Type Safety**
   - Use TypeScript for workflows
   - Enforce rules at compile time

---

## 🔧 Key Technical Concepts

### 1. **MI Orchestration Pipeline**
**Purpose:** AI-powered store generation workflow

**Stages:**
1. `plan_store` - Analyze business and create plan
2. `seed_catalog` - Generate initial products/categories
3. `sync-store` - Persist catalog to database

**Key Files:**
- `apps/core/cardbey-core/src/routes/miRoutes.js` - API endpoints
- `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts` - Catalog generation
- `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts` - Planning stage

### 2. **DraftStore Model**
**Purpose:** Temporary store data before commitment

**Schema:**
```prisma
model DraftStore {
  id              String   @id @default(cuid())
  committedStoreId String?  // Links to Business.id when committed
  input           Json?    // Input parameters (includes generationRunId)
  preview         Json?     // Generated catalog (products, categories)
  status          String    // 'draft' | 'generating' | 'ready' | 'error'
  error           String?   // Error message (maps to lastError)
  updatedAt       DateTime  // Maps to lastErrorAt when error
  createdAt       DateTime
}
```

**Status Flow:**
```
draft → generating → ready (success)
                    ↓
                  error (failure)
```

### 3. **generationRunId**
**Purpose:** Unique identifier per generation run to prevent state bleed

**Usage:**
- Links frontend requests to backend jobs
- Ensures `DraftStore` rows don't interfere
- Required for idempotency checks

**Format:** `gen-${Date.now()}-${random}`

### 4. **Polling System**
**Purpose:** Check for draft/job status updates

**Implementation:**
- `usePoller` hook - Shared polling logic
- Single-flight protection (abort previous on new tick)
- Exponential backoff on rate limits
- Terminal state detection (stop on `'ready'`/`'error'`)

**Key Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePoller.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

### 5. **Error Handling Pattern**
**Helper:** `markDraftError({ committedStoreId, generationRunId, jobId, err, stage })`

**Purpose:** Centralized error reporting to `DraftStore`

**Ensures:**
- `status='error'` is set
- `error` field is always populated (max 2000 chars)
- `updatedAt` is always set (maps to `lastErrorAt`)

**Location:** `apps/core/cardbey-core/src/routes/miRoutes.js`

---

## 🗂️ Important Files Reference

### Backend Core Files

| File | Purpose |
|------|---------|
| `apps/core/cardbey-core/src/routes/miRoutes.js` | MI orchestration API endpoints |
| `apps/core/cardbey-core/src/routes/stores.js` | Store/draft API endpoints |
| `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts` | Catalog generation logic |
| `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts` | Store planning logic |
| `apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts` | Store intent inference |
| `apps/core/cardbey-core/prisma/schema.prisma` | Database schema |

### Frontend Core Files

| File | Purpose |
|------|---------|
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` | Store review/draft page |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | Draft review component |
| `apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePoller.ts` | Shared polling hook |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` | API client (deduplication, rate limiting) |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/store-review/draftGuards.ts` | Draft state logic helpers |

---

## 🐛 Common Error Patterns & Fixes

### 1. **Temporal Dead Zone (TDZ) Errors**
**Symptom:** `ReferenceError: Cannot access 'X' before initialization`

**Common Causes:**
- Variable accessed before `let`/`const` declaration
- Variable used in default parameter before declaration
- Variable used in closure before declaration

**Fix Pattern:**
```typescript
// ❌ BAD:
if (storeIntent?.cuisine) { ... }  // Access
let storeIntent = null;             // Declaration (too late!)

// ✅ GOOD:
let storeIntent = paramStoreIntent || null;  // Declare first
if (storeIntent?.cuisine) { ... }           // Then access
```

**Recent Fixes:**
- ✅ `storeIntent` in `seedCatalogService.ts`
- ✅ `tenantId` in `miRoutes.js` idempotency check

### 2. **Prisma Schema Mismatches**
**Symptom:** `PrismaClientValidationError: Unknown field 'X'`

**Common Causes:**
- Field name changed in schema but code still uses old name
- Field doesn't exist in schema

**Fix Pattern:**
```typescript
// ❌ BAD:
select: { profileName: true }  // Field doesn't exist

// ✅ GOOD:
select: { name: true }  // Use existing field
// Post-process: profileName: dbStore.name || undefined
```

**Recent Fixes:**
- ✅ `profileName` in `storeIntent.ts` (removed, use `name` as fallback)

### 3. **Polling Storms**
**Symptom:** `CLIENT_RATE_LIMIT: Too many requests`

**Common Causes:**
- No single-flight guard
- No exponential backoff
- Polling continues after terminal state

**Fix Pattern:**
```typescript
// ✅ GOOD:
const inFlightRef = useRef(false);
if (inFlightRef.current) return;  // Single-flight guard
inFlightRef.current = true;
try {
  // ... fetch ...
} finally {
  inFlightRef.current = false;
}

// Exponential backoff:
if (err?.code === 'RATE_LIMIT') {
  backoffMsRef.current = Math.min(backoffMsRef.current * 2, 8000);
  return; // Skip this tick
}
```

**Recent Fixes:**
- ✅ Added single-flight guard in `StoreReviewPage.tsx`
- ✅ Added exponential backoff
- ✅ Terminal state checks

### 4. **DraftStore Status Inconsistencies**
**Symptom:** `status='error'` but `error`/`updatedAt` are null

**Common Causes:**
- Direct status update without error fields
- Missing `markDraftError` helper usage

**Fix Pattern:**
```typescript
// ❌ BAD:
await prisma.draftStore.update({
  data: { status: 'error' }  // Missing error field!
});

// ✅ GOOD:
await markDraftError({
  committedStoreId: storeId,
  generationRunId,
  jobId,
  err: error,
  stage: 'seedCatalogService',
});
```

**Recent Fixes:**
- ✅ All error paths use `markDraftError` helper
- ✅ Draft endpoint synthesizes fallback error if null

---

## 🎯 Current Development Focus

### Active Work Areas

1. **Store Generation Pipeline Stability**
   - Ensuring `DraftStore` creation/update consistency
   - `generationRunId` alignment across pipeline
   - Error state propagation

2. **Frontend Polling Optimization**
   - Reducing unnecessary API calls
   - Improving rate limit handling
   - Better terminal state detection

3. **Error Reporting**
   - Ensuring all errors are captured with context
   - UI error display improvements
   - Debug logging cleanup

### Next Steps (Suggested)

1. **Monitoring & Observability**
   - Add structured logging for pipeline stages
   - Track `generationRunId` consistency
   - Monitor error rates

2. **Testing**
   - Add integration tests for draft generation flow
   - Test error scenarios
   - Test polling edge cases

3. **Documentation**
   - API endpoint documentation
   - Error code reference
   - Troubleshooting guide

---

## 🔍 Debugging Tips

### Enable Debug Logging
```javascript
localStorage.setItem('cardbey.debug', 'true');
// Reload page, check console for [draft-load], [DRAFT_STATE], etc.
```

### Check DraftStore Status
```sql
SELECT id, status, error, "updatedAt", 
       jsonb_array_length((preview->'catalog'->'products')::jsonb) as products_count
FROM "DraftStore" 
WHERE "committedStoreId" = 'YOUR_STORE_ID'
ORDER BY "createdAt" DESC 
LIMIT 1;
```

### Check OrchestratorTask Status
```sql
SELECT id, status, "entryPoint", 
       (request->>'generationRunId') as generation_run_id
FROM "OrchestratorTask"
WHERE (request->>'storeId') = 'YOUR_STORE_ID'
ORDER BY "createdAt" DESC
LIMIT 1;
```

### Network Tab Checks
- Look for `NS_BINDING_ABORTED` (expected during polling)
- Check for `CLIENT_RATE_LIMIT` errors (should trigger backoff)
- Verify `sync-store` called at most once per `generationRunId`

---

## 📚 Additional Resources

### Documentation Files
- `README.md` - Project overview
- `docs/DEVELOPMENT_PRINCIPLES.md` - ⭐ **CRITICAL: Read first!**
- `DRAFT_PIPELINE_DEEP_SCAN_FINAL_REPORT.md` - Deep analysis of draft pipeline
- `DRAFT_REVIEW_FIX_SUMMARY.md` - Recent fixes summary
- `STOREINTENT_TDZ_FIX_FINAL_REPORT.md` - TDZ error fix details

### Architecture Docs
- `apps/core/cardbey-core/ARCHITECTURE.md` - Backend architecture
- `apps/core/cardbey-core/README.md` - Backend setup guide

### Recent Fix Reports
- `DRAFT_REVIEW_FIX_SUMMARY.md` - Polling & rate limiting fixes
- `STOREINTENT_TDZ_FIX_FINAL_REPORT.md` - TDZ error fix
- `SEEDCATALOG_TDZ_FIX_REPORT.md` - Seed catalog TDZ fix

---

## 🤝 Working with Grok

### When Asking for Help

1. **Provide Context:**
   - What feature/flow are you working on?
   - What error/symptom are you seeing?
   - What files are involved?

2. **Include Logs:**
   - Console errors
   - Network tab requests
   - Backend logs (if available)

3. **Reference This Document:**
   - Point to relevant sections
   - Mention recent fixes that might be related

### When Implementing Fixes

1. **Follow Development Principles:**
   - Read `docs/DEVELOPMENT_PRINCIPLES.md`
   - Maintain single source of truth
   - No silent fallbacks

2. **Check Recent Fixes:**
   - Review `DRAFT_REVIEW_FIX_SUMMARY.md`
   - Check for similar patterns
   - Reuse existing helpers (`markDraftError`, `usePoller`, etc.)

3. **Test Thoroughly:**
   - Test error scenarios
   - Test edge cases
   - Verify no regressions

---

## 🚀 Quick Start for New Contributors

1. **Read Foundation Rules:**
   ```bash
   cat docs/DEVELOPMENT_PRINCIPLES.md
   ```

2. **Set Up Development Environment:**
   ```bash
   # Backend
   cd apps/core/cardbey-core
   pnpm install
   pnpm dev  # Runs on port 3001

   # Frontend
   cd apps/dashboard/cardbey-marketing-dashboard
   pnpm install
   pnpm dev  # Runs on port 5174
   ```

3. **Enable Debug Logging:**
   ```javascript
   localStorage.setItem('cardbey.debug', 'true');
   ```

4. **Test Store Generation Flow:**
   - Navigate to store creation
   - Start generation
   - Monitor console for `[DRAFT_STATE]` logs
   - Check Network tab for polling behavior

---

## 📝 Summary for Grok

**Cardbey** is an AI-first platform for store management with a focus on:
- **AI-powered content generation** (products, categories, marketing content)
- **Draft-based workflows** (preview before commit)
- **Orchestrated pipelines** (plan → generate → sync)

**Current State:**
- ✅ Recent fixes: Polling storms, TDZ errors, Prisma mismatches
- 🟡 Monitoring: Draft pipeline stability, error propagation
- 📋 Next: Testing, observability, documentation

**Key Principles:**
- AI-first development
- User journey integrity (never skip steps)
- Single source of truth
- No silent fallbacks

**When helping:**
- Reference this document for context
- Check recent fix reports for patterns
- Follow development principles
- Test thoroughly

---

**Last Updated:** 2025-01-XX  
**Maintained By:** Auto (Cursor AI) + Grok (X.AI)  
**Status:** Active Development

