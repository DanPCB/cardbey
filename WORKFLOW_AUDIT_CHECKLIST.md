# Workflow Audit Checklist - MI Orchestrator Backend Upgrade

**Date:** 2026-01-25  
**Goal:** Verify old UI/UX workflow preserved while MI orchestrator powers backend  
**Status:** Audit Complete

---

## 1. QuickStart (Generate → Review)

| Item | Status | File/Function | Endpoint/Details |
|------|--------|---------------|------------------|
| Goal mapping: form/voice → build_store | ✅ Done | `quickStart.ts:763-769` | Maps `'form'` and `'voice'` to `'build_store'` |
| Goal mapping: ocr → build_store_from_menu | ✅ Done | `quickStart.ts:766` | Maps `'ocr'` to `'build_store_from_menu'` |
| Goal mapping: url → build_store_from_website | ✅ Done | `quickStart.ts:767` | Maps `'url'` to `'build_store_from_website'` |
| Goal mapping: template → build_store_from_template | ✅ Done | `quickStart.ts:768` | Maps `'template'` to `'build_store_from_template'` |
| Navigation URL includes jobId | ✅ Done | `quickStart.ts:1346` | `URLSearchParams({ mode: 'draft', jobId })` |
| Navigation URL includes generationRunId | ✅ Done | `quickStart.ts:1347-1349` | `params.set('generationRunId', generationRunId)` |
| Draft polling uses generationRunId | ✅ Done | `quickStart.ts:1375` | `?generationRunId=${generationRunId}` |
| StoreId mismatch logic (security only) | ✅ Done | `miRoutes.js:1084-1125` | Only blocks if storeId doesn't belong to user (ownership check) |
| Backend goal→entryPoint mapping | ✅ Done | `miRoutes.js:874-879` | `GOAL_TO_ENTRYPOINT` table matches frontend |

---

## 2. Draft Endpoint

| Item | Status | File/Function | Endpoint/Details |
|------|--------|---------------|------------------|
| Response always includes `store` object | ✅ Done | `draftCompatRoutes.js:352` | Always returns `store: storeObject` (synthesized if needed) |
| Response always includes `generationRunId` | ✅ Done | `draftCompatRoutes.js:349` | Top-level `generationRunId: draftGenerationRunId` |
| Response includes `products` array | ✅ Done | `draftCompatRoutes.js:354-368` | `products: products.map(...)` |
| Response includes `categories` array | ✅ Done | `draftCompatRoutes.js:369-374` | `categories: categories.map(...)` |
| Response includes `preview` object | ✅ Done | `draftCompatRoutes.js:376` | `preview` included for backward compatibility |
| Selection logic uses generationRunId | ✅ Done | `draftCompatRoutes.js:100-119` | Filters drafts by `generationRunId` when provided |
| Call site: StoreReviewPage (authenticated) | ✅ Done | `StoreReviewPage.tsx:578-581` | Includes `?generationRunId=${effectiveGenerationRunId}` |
| Call site: StoreReviewPage (public) | ✅ Done | `StoreReviewPage.tsx:109-112` | Includes `?generationRunId=${effectiveGenerationRunId}` |
| Call site: quickStart polling | ✅ Done | `quickStart.ts:1375` | Includes `?generationRunId=${generationRunId}` |
| Call site: StoreDraftReview (hero save) | ✅ Done | `StoreDraftReview.tsx:720` | Includes `?generationRunId=${generationRunId}` |
| Call site: StoreDraftReview (avatar refresh) | ✅ Fixed | `StoreDraftReview.tsx:3663` | Now includes `?generationRunId=${generationRunId}` |
| Call site: StoreDraftReview (avatar fallback) | ✅ Fixed | `StoreDraftReview.tsx:3680` | Now includes `?generationRunId=${generationRunId}` |
| Call site: LoginPage (pending promo) | ✅ Fixed | `LoginPage.tsx:149,316` | Now includes `?generationRunId=${generationRunId}` |

---

## 3. MI Input Field ("Ask MI what to do...")

| Item | Status | File/Function | Endpoint/Details |
|------|--------|---------------|------------------|
| Component location | ✅ Found | `MICommandBar.tsx:231` | `placeholder="Ask MI what to do…"` |
| Submit handler exists | ⚠️ Stubbed | `MICommandBar.tsx:212-219` | Shows "coming soon" toast, doesn't trigger orchestrator |
| Error handling (never stuck loading) | ✅ Done | `MICommandBar.tsx:137,152,173` | Always resets `setRunningGoal(null)` on error |
| Suggestion chips trigger orchestrator | ✅ Done | `MICommandBar.tsx:100-176` | `handleMIAction()` calls `startOrchestraTask()` + `runOrchestraJob()` |
| Suggestion chips use generationRunId | ✅ Done | `MICommandBar.tsx:117` | Reuses current draft's `generationRunId` |
| Suggestion chips refresh draft | ✅ Done | `MICommandBar.tsx:91` | `onJobComplete?.()` triggers draft refresh |

---

## 4. Promo Creation (from-draft)

| Item | Status | File/Function | Endpoint/Details |
|------|--------|---------------|------------------|
| Endpoint exists | ✅ Done | `miRoutes.js:3648` | `POST /api/mi/promo/from-draft` |
| ProductId exact match works | ✅ Done | `promoFromDraft.js:121` | `products.find(p => p.id === productId)` |
| ProductId name fallback works | ✅ Done | `promoFromDraft.js:123-145` | Fallback by name if ID doesn't match |
| JSON path errors fixed | ✅ Done | `promoFromDraft.js:74-114` | Uses JS filtering instead of Prisma JSON path |
| Creates Content record | ✅ Done | `promoFromDraft.js:196-244` | `prisma.content.create()` with `mode: 'promo'` |
| Returns instanceId | ✅ Done | `promoFromDraft.js:274` | `instanceId: content.id` |
| Returns editorUrl | ✅ Done | `promoFromDraft.js:269,276` | `editorUrl: ${baseUrl}/app/creative-shell?instanceId=${content.id}` |
| UI routes to Content Studio | ✅ Done | `StoreDraftReview.tsx:2762` | `navigate(normalizedEditorUrl)` |
| UI handles errors gracefully | ✅ Done | `StoreDraftReview.tsx:2787-2790` | Shows error toast, closes modal |

---

## 5. SmartObject (Deploy Flow)

| Item | Status | File/Function | Endpoint/Details |
|------|--------|---------------|------------------|
| NOT created during promo creation | ✅ Correct | N/A | SmartObject created later during Deploy |
| Created during Deploy (print env) | ✅ Done | `PromoDeployPage.tsx:178-244` | `loadOrCreateSmartObject()` calls `POST /api/smart-objects` |
| Binding endpoint exists | ✅ Done | `smartObjectRoutes.js:214` | `POST /api/smart-objects/:id/active-promo` |
| Binding works | ✅ Done | `smartObjectRoutes.js:255-267` | `prisma.smartObjectActivePromo.upsert()` |
| QR resolution endpoint exists | ✅ Done | `qrRoutes.js:22` | `GET /q/:code` |
| QR resolution works | ✅ Done | `qrRoutes.js:27-108` | Looks up `SmartObject` by `publicCode`, resolves promo |
| QR scan logging works | ✅ Done | `qrRoutes.js:57-62` | `prisma.smartObjectScan.create()` (non-blocking) |

---

## 6. Publish

| Item | Status | File/Function | Endpoint/Details |
|------|--------|---------------|------------------|
| Endpoint exists | ✅ Done | `stores.js:816` | `POST /api/store/publish` |
| Endpoint works | ✅ Done | `stores.js:816-1054` | Full implementation: commits draft to Business + Products |
| Uses generationRunId when provided | ✅ Done | `stores.js:863-875` | Filters drafts by `generationRunId` if provided |
| Falls back to best draft | ✅ Done | `stores.js:878-888` | Uses status priority if no generationRunId match |
| Returns publishedStoreId | ✅ Done | `stores.js:1047` | `publishedStoreId: storeId` |
| Returns storefrontUrl | ✅ Done | `stores.js:1048` | `storefrontUrl: ${baseUrl}/app/store/${storeId}` |

---

## Summary

### ✅ Working (23 items)
- QuickStart goal mapping (all 4 options)
- Navigation URLs (jobId + generationRunId)
- Draft endpoint response shape
- Draft selection logic
- Promo creation (exact + fallback matching)
- SmartObject creation/binding
- QR resolution
- Publish endpoint

### ⚠️ Needs Patch (1 item)
1. **MICommandBar.tsx:212-219** - Text input stubbed (shows "coming soon") - P1 priority

### ❌ Missing (0 items)
- None

---

## Remaining Tasks (Priority Order)

### P0 - Critical (Must Fix)
**None** - All critical paths working

### P1 - Important (Should Fix)
1. **Wire MI text input to orchestrator** (2-3 hours)
   - File: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/MICommandBar.tsx`
   - Lines: 212-219
   - Fix: Replace stub with natural language → goal mapping → orchestrator call
   - Option A: Call `/api/mi/orchestra/infer` to map text to goal, then call `handleMIAction(goal)`
   - Option B: Direct orchestrator call with rawInput (if backend supports it)

### P2 - Nice to Have (Future)
- None

---

## Fastest Patch Plan

### Step 1: ✅ COMPLETED - Fix generationRunId omissions
- Fixed `StoreDraftReview.tsx:3663` - Avatar refresh now includes generationRunId
- Fixed `StoreDraftReview.tsx:3680` - Avatar fallback now includes generationRunId
- Fixed `LoginPage.tsx:149,316` - Pending promo draft fetch now includes generationRunId

### Step 2: Wire MI text input (2-3 hours) - P1
```typescript
// MICommandBar.tsx:212-219
const handleCommandSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!commandInput.trim()) return;
  
  // Call MI inference to map text to goal
  const inferResponse = await apiPOST('/api/mi/orchestra/infer', {
    rawInput: commandInput.trim(),
    storeId,
    generationRunId,
  });
  
  if (inferResponse.ok && inferResponse.goal) {
    await handleMIAction(inferResponse.goal, inferResponse.label || 'MI task');
  } else {
    toast('Could not understand command. Try using the suggestion chips.', 'error');
  }
  
  setCommandInput('');
};
```

---

## Verification Checklist

- [x] QuickStart navigates to review with jobId + generationRunId
- [x] Review page loads correct draft using generationRunId
- [x] Draft endpoint always returns store + generationRunId
- [x] MI suggestion chips trigger orchestrator jobs
- [x] Promo creation works with productId match
- [x] Promo creation works with product name fallback
- [x] Promo creation routes to Content Studio
- [x] SmartObject created during Deploy (not during promo creation)
- [x] SmartObject binding works
- [x] QR resolution works and logs scans
- [x] Publish endpoint exists and works
- [ ] MI text input wired (stubbed - P1)
- [x] All draft call sites include generationRunId (✅ All fixed)

---

**Audit Complete** - Old UI/UX workflow preserved. 1 minor patch remaining (P1 priority: MI text input wiring).

