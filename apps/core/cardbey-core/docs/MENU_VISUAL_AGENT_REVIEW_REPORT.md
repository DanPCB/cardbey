# 🔍 MenuVisualAgent - Reviewer Validation Report

**Agent:** Reviewer  
**Date:** 2025-12-14  
**Status:** ✅ **APPROVED with Minor Recommendations**

---

## ✅ Architecture Review

### **No Circular Dependencies** ✅
**Status:** PASS

**Evidence:**
- `configureMenu.js` uses dynamic import: `await import('../../services/menuVisualAgent/imageGenerationJob.js')`
- Import chain verified:
  - `imageGenerationJob.ts` → `menuVisualAgent.ts` → `unsplashService.ts` / `openaiImageService.ts` / `stylePresets.ts`
  - No circular references detected
- All imports are unidirectional (services → utilities, not vice versa)

**File References:**
- `apps/core/cardbey-core/src/engines/menu/configureMenu.js:116` (dynamic import - FIXED: corrected path from `../` to `../../`)
- `apps/core/cardbey-core/src/services/menuVisualAgent/imageGenerationJob.ts:9` (imports menuVisualAgent)

---

### **Business Builder Flow Unchanged** ✅
**Status:** PASS

**Evidence:**
- `configureMenu.js` queues job with `.catch()` wrapper (non-blocking)
- Job queueing happens AFTER menu configuration completes
- No `await` without `.catch()` - errors are logged but don't throw
- Business Builder publish flow (`completeOnboarding`) has no image generation dependencies

**Code Review:**
```javascript
// configureMenu.js:120-123
await queueImageGenerationJob(storeId, undefined, tenantId, tenantId).catch(err => {
  console.error('[Menu Engine] Failed to queue image generation job:', err);
  // Non-blocking: log error but don't throw
});
```

**Verification:**
- ✅ `completeOnboarding` in `useOnboardingState.ts` has no image generation calls
- ✅ Step 5 "Go Live" completion doesn't wait for images
- ✅ Menu OCR → Products created → Job queued (async) → Return success

---

### **Async Jobs Don't Block Publish** ✅
**Status:** PASS

**Evidence:**
- Job queue uses `OrchestratorTask` with status "queued"
- Worker process polls every 30 seconds (background)
- `configureMenu` returns immediately after queuing job
- No blocking `await` on image generation

**Worker Process:**
- `apps/core/cardbey-core/src/worker.js:47-52` (30s polling interval)
- Processes max 5 jobs per run (rate limiting)
- Jobs marked "queued" → "running" → "completed"/"failed"

---

## ✅ Legal / Safety Review

### **No Scraping Logic** ✅
**Status:** PASS

**Evidence:**
- `unsplashService.ts` uses official `unsplash-js` SDK
- Only calls: `unsplashApi.search.getPhotos()` (official API method)
- No web scraping, no HTML parsing, no direct HTTP requests to Unsplash
- OpenAI service uses official `openai` SDK

**Code Review:**
```typescript
// unsplashService.ts:55-60
const result = await unsplashApi.search.getPhotos({
  query: searchQuery,
  orientation: 'landscape',
  perPage: 1,
});
```

---

### **No Training or Model Storage** ✅
**Status:** PASS

**Evidence:**
- Only stores image URLs in `Product.images` JSON
- No binary image data stored
- No model training code
- No local image caching/downloading
- OpenAI DALL-E 3 generates images via API (no local generation)

**Data Storage:**
- `Product.imageUrl`: String (URL only)
- `Product.images`: JSON array with `{ url, source, metadata }` (URLs only)

---

### **Stock Images Sourced via API Only** ✅
**Status:** PASS

**Evidence:**
- Unsplash: Official API via `unsplash-js` SDK
- OpenAI: Official API via `openai` SDK
- No fallback to scraping or unauthorized sources
- Attribution metadata stored for Unsplash images

**Attribution Storage:**
```typescript
// menuVisualAgent.ts:99-103
metadata: {
  attribution: unsplashResult.attribution,
  photographer: unsplashResult.photographer,
  photographerUrl: unsplashResult.photographerUrl,
}
```

---

## ✅ Product Review

### **Users Can Publish Without Images** ✅
**Status:** PASS

**Evidence:**
- Feature flag gated: `ENABLE_MENU_VISUAL_AGENT` must be `true`
- Image generation is async (never blocks)
- `configureMenu` returns success even if job queue fails
- Business Builder "Go Live" doesn't check for images

**Verification:**
- ✅ Menu OCR completes → Products created → Success returned
- ✅ Job queued in background (non-blocking)
- ✅ If feature disabled, no image generation attempted
- ✅ If API keys missing, job fails gracefully (doesn't block)

---

### **Regenerate / Upload Options Exist** ✅
**Status:** PASS

**Evidence:**
- Regenerate button in `MenuItemCard` component
- Feature flag gated: Only shows if `menu_visual_agent_v1` enabled
- API endpoint: `POST /api/menu/regenerate-image`
- Loading state shown during regeneration

**Frontend Implementation:**
- `apps/dashboard/cardbey-marketing-dashboard/src/components/menu/MenuStateViewer.jsx:225-239`
- Button with `RefreshCw` icon
- Disabled state during regeneration
- Toast notifications for success/error

**Note:** Manual upload override not implemented in MVP (out of scope per plan)

---

### **Style Consistency Enforced** ✅
**Status:** PASS

**Evidence:**
- Style presets extracted from `Business.stylePreferences`
- 4 presets: modern, warm, minimal, vibrant
- Defaults to 'modern' if no style found
- Style applied to both Unsplash search and OpenAI prompts

**Style Application:**
```typescript
// stylePresets.ts:50-72
export async function getStylePreset(businessId: string): Promise<StylePreset>
// Returns preset based on Business.stylePreferences JSON
```

---

## ⚠️ Performance Review

### **Image Generation is Async** ✅
**Status:** PASS

**Evidence:**
- Job queue system (OrchestratorTask)
- Worker process polls every 30 seconds
- No blocking operations in main flow
- Errors logged but don't throw

---

### **Retry Count Capped** ⚠️
**Status:** PARTIAL - Needs Improvement

**Current State:**
- ❌ No explicit retry logic for failed jobs
- ❌ Failed jobs remain in "failed" status (not retried)
- ✅ Individual item failures don't stop batch processing

**Recommendation:**
- Add retry count field to `OrchestratorTask.request` JSON
- Retry failed jobs up to 3 times
- After 3 failures, mark as "failed_permanent"

**Suggested Fix:**
```typescript
// In imageGenerationJob.ts processImageGenerationJobs()
const retryCount = (job.request as any).retryCount || 0;
if (retryCount < 3 && job.status === 'failed') {
  // Retry job
}
```

**Severity:** LOW (jobs can be manually retried via regenerate button)

---

### **No Excessive API Calls** ✅
**Status:** PASS

**Evidence:**
- Worker processes max 5 jobs per run (line 77: `limit: number = 5`)
- Each job processes items sequentially (not parallel)
- Unsplash: 1 request per item (1 result per search)
- OpenAI: 1 request per item (n=1)
- Rate limit handling: Unsplash errors return null (fallback to OpenAI)

**Rate Limit Handling:**
```typescript
// openaiImageService.ts:88-91
if (error.status === 429) {
  console.warn('[OpenAIImageService] Rate limit hit, will retry later');
}
```

**Note:** No exponential backoff implemented, but jobs can be retried manually

---

## 📋 Issues Found

### **Issue 0: Import Path Fixed** ✅
**Severity:** CRITICAL (Fixed)  
**File:** `apps/core/cardbey-core/src/engines/menu/configureMenu.js:116`

**Problem:**
- Import path was incorrect: `../services/` should be `../../services/`
- Would cause runtime import error

**Fix Applied:**
- Changed to: `../../services/menuVisualAgent/imageGenerationJob.js`
- Verified file exists at correct path

---

### **Issue 1: Missing Retry Logic** ⚠️
**Severity:** LOW  
**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/imageGenerationJob.ts`

**Problem:**
- Failed jobs are not automatically retried
- Jobs remain in "failed" status permanently

**Impact:**
- Low - Users can manually retry via regenerate button
- Jobs can be manually requeued

**Recommendation:**
- Add retry count tracking (3 max retries)
- Auto-retry failed jobs on next worker run (if retryCount < 3)

---

### **Issue 2: No Exponential Backoff** ⚠️
**Severity:** LOW  
**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/openaiImageService.ts`

**Problem:**
- Rate limit errors (429) are logged but job is not rescheduled
- No backoff delay before retry

**Impact:**
- Low - Worker runs every 30s (natural backoff)
- Manual retry available

**Recommendation:**
- Add exponential backoff for 429 errors
- Reschedule job with delay: `runAt: new Date(Date.now() + backoffMs)`

---

### **Issue 3: Frontend Polling Not Implemented** ⚠️
**Severity:** LOW  
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/menu/MenuStateViewer.jsx:169-175`

**Problem:**
- Regenerate button uses `setTimeout(10000)` then `window.location.reload()`
- No actual polling or SSE events to detect completion

**Impact:**
- Low - Images appear after manual refresh
- User experience could be improved

**Recommendation:**
- Implement polling: `useQuery` with `refetchInterval`
- Or use SSE events to notify on completion
- Show "Image generated" toast when complete

**Note:** Marked as TODO in code (line 169), acceptable for MVP

---

## ✅ Approval Status

### **Overall: APPROVED** ✅

**Summary:**
- ✅ Architecture: No circular deps, Business Builder unchanged, async jobs non-blocking
- ✅ Legal/Safety: No scraping, no training, API-only, attribution stored
- ✅ Product: Publish works without images, regenerate exists, style enforced
- ⚠️ Performance: Async ✅, Retry logic needs improvement, API calls controlled

**Blocking Issues:** NONE

**Non-Blocking Recommendations:**
1. Add retry logic for failed jobs (3 max retries)
2. Add exponential backoff for rate limits
3. Improve frontend polling (replace setTimeout with proper polling/SSE)

---

## 🎯 Suggested Fixes (Optional - Not Required for MVP)

### **Fix 1: Add Retry Logic**
```typescript
// In imageGenerationJob.ts
const retryCount = (job.request as any).retryCount || 0;
if (job.status === 'failed' && retryCount < 3) {
  // Update job to queued with incremented retryCount
  await prisma.orchestratorTask.update({
    where: { id: job.id },
    data: {
      status: 'queued',
      request: { ...request, retryCount: retryCount + 1 },
    },
  });
}
```

### **Fix 2: Add Exponential Backoff**
```typescript
// In openaiImageService.ts
if (error.status === 429) {
  const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
  // Reschedule job with delay
}
```

### **Fix 3: Improve Frontend Polling**
```typescript
// Replace setTimeout with useQuery polling
const { data: jobStatus } = useQuery({
  queryKey: ['imageJob', taskId],
  queryFn: () => apiGET(`/api/menu/job-status/${taskId}`),
  enabled: !!taskId,
  refetchInterval: 2000, // Poll every 2 seconds
});
```

---

## 📝 Final Verdict

**✅ APPROVED FOR PRODUCTION**

The implementation follows the plan correctly, maintains system stability, and meets all critical requirements. The identified issues are minor and can be addressed in future iterations.

**Ready for:** Deployment with feature flag `ENABLE_MENU_VISUAL_AGENT=false` initially, then gradual rollout.

---

**Reviewer Signature:** AGENT 3 — REVIEWER  
**Date:** 2025-12-14

