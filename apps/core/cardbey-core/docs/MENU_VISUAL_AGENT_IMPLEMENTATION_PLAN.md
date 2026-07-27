# 🧭 MenuVisualAgent Implementation Plan

**Agent:** Planner  
**Date:** 2025-12-14  
**Status:** Ready for Review

---

## 📋 Executive Summary

This plan adds a **MenuVisualAgent** that automatically sources/generates images for menu items created via OCR or manual entry. The system is **non-blocking**, **legally safe**, **async**, and **reversible**.

**Core Principle:** Images enhance menus but never block Business Builder publish flow.

---

## 🎯 Objectives

1. **Auto-enrich menu items** with appropriate images after OCR/manual creation
2. **Non-blocking:** Publish works immediately, images populate in background
3. **Legally safe:** Only API-sourced images (Unsplash) or AI-generated (OpenAI DALL-E)
4. **User control:** Users can regenerate, replace, or remove images
5. **Style consistency:** Images match business brand/style preferences

---

## 📊 Current State Analysis

### Existing Systems
- ✅ **Menu OCR:** `extractMenu`, `parseMenuWithLLM`, `configureMenu`
- ✅ **Product Model:** `Product` table with `imageUrl` (string) and `images` (JSON array)
- ✅ **Feature Flags:** `featureFlags.ts` with `isFeatureEnabled()` pattern
- ✅ **Async Jobs:** `planner-runner.js` (60s polling), `orchestratorTask` model
- ✅ **OpenAI Integration:** `openai` package, `OPENAI_API_KEY` env var
- ✅ **Business Builder:** Onboarding wizard, store creation flow

### Gaps Identified
- ❌ No image sourcing service (Unsplash API not integrated)
- ❌ No AI image generation service (OpenAI DALL-E not used)
- ❌ No async job queue for image generation
- ❌ No style preset system for image selection
- ❌ Product images not auto-populated after menu OCR

---

## 🏗️ Architecture Overview

```
Menu OCR/Manual Entry
       ↓
  Products Created
       ↓
  [Feature Flag Check]
       ↓
  Queue Image Job (async)
       ↓
  ┌─────────────────────┐
  │ MenuVisualAgent      │
  │ 1. Get style preset  │
  │ 2. For each item:    │
  │    a. Try Unsplash   │
  │    b. Fallback: AI   │
  │ 3. Update Product    │
  └─────────────────────┘
       ↓
  Images Attached
  (non-blocking)
```

---

## 📝 Implementation Steps

### **STEP 1: Data Model (Minimal Changes)**

**File:** `apps/core/cardbey-core/prisma/schema.prisma`

**Changes:**
- ✅ **No schema changes required** - `Product.images` (JSON) already exists
- ✅ Use existing `Product.imageUrl` for primary image
- ✅ Store image metadata in `Product.images` JSON: `[{url, source: "unsplash"|"openai", style, generatedAt}]`

**Migration:** None needed.

---

### **STEP 2: Feature Flag**

**File:** `apps/core/cardbey-core/src/routes/home.js`

**Change:**
```javascript
router.get('/v2/flags', (req, res) => {
  res.json({
    // ... existing flags
    menu_visual_agent_v1: process.env.ENABLE_MENU_VISUAL_AGENT === 'true' || false,
  });
});
```

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/featureFlags.ts`  
**No changes needed** - uses existing `isFeatureEnabled()` pattern.

---

### **STEP 3: External API Utilities**

#### **3A. Unsplash Service**

**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/unsplashService.ts` (NEW)

**Responsibilities:**
- Search Unsplash API for food/product images
- Respect rate limits (50 requests/hour for free tier)
- Return image URL + attribution metadata
- Handle API failures gracefully

**API Key:** `UNSPLASH_ACCESS_KEY` env var (optional, falls back to AI if missing)

**Functions:**
```typescript
export async function searchUnsplashImage(
  query: string,
  style?: 'modern' | 'warm' | 'minimal' | 'vibrant'
): Promise<{ url: string; attribution: string } | null>
```

**Dependencies:**
- Add `unsplash-js` package: `npm install unsplash-js`

---

#### **3B. OpenAI Image Generation Service**

**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/openaiImageService.ts` (NEW)

**Responsibilities:**
- Generate images via OpenAI DALL-E 3 API
- Use menu item name + description as prompt
- Apply style presets (modern, warm, minimal, vibrant)
- Return image URL + generation metadata

**Functions:**
```typescript
export async function generateMenuItemImage(
  itemName: string,
  description?: string,
  style?: 'modern' | 'warm' | 'minimal' | 'vibrant'
): Promise<{ url: string; prompt: string } | null>
```

**Dependencies:**
- ✅ Already installed: `openai` package
- Uses existing `OPENAI_API_KEY` env var

---

### **STEP 4: Style Preset System**

**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/stylePresets.ts` (NEW)

**Responsibilities:**
- Define style presets (modern, warm, minimal, vibrant)
- Map presets to Unsplash search terms and OpenAI prompts
- Extract style from `Business.stylePreferences` JSON

**Functions:**
```typescript
export interface StylePreset {
  name: string;
  unsplashKeywords: string[];
  openaiPromptSuffix: string;
}

export function getStylePreset(business: Business): StylePreset
export function buildImagePrompt(itemName: string, description: string, style: StylePreset): string
```

**Default:** `modern` if no style specified.

---

### **STEP 5: MenuVisualAgent Orchestrator**

**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts` (NEW)

**Responsibilities:**
- Main orchestration logic
- For each menu item: try Unsplash → fallback to AI
- Update `Product.images` JSON array
- Set `Product.imageUrl` to first image
- Emit events for progress tracking

**Functions:**
```typescript
export async function generateImagesForMenu(
  storeId: string,
  itemIds?: string[] // If undefined, process all items without images
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}>
```

**Flow:**
1. Load store/business (get style preferences)
2. Load products (filter by `itemIds` or all without images)
3. For each product:
   - Get style preset
   - Try Unsplash (if API key available)
   - If Unsplash fails/null → try OpenAI
   - Update `Product.images` JSON + `imageUrl`
4. Return summary

**Error Handling:**
- Log errors but don't throw (non-blocking)
- Continue processing other items if one fails
- Return partial success counts

---

### **STEP 6: Async Job Queue**

**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/imageGenerationJob.ts` (NEW)

**Responsibilities:**
- Create async job record in database
- Queue job for background processing
- Process jobs via existing planner-runner or new worker

**Option A: Use Existing Planner System**

**File:** `apps/core/cardbey-core/src/services/planner-runner.js`

**Add job type:**
```javascript
case 'MENU_VISUAL_GENERATION':
  const { storeId, itemIds } = task.params;
  await generateImagesForMenu(storeId, itemIds);
  break;
```

**Option B: New Worker (Recommended for MVP)**

**File:** `apps/core/cardbey-core/src/worker.js`

**Add:**
```javascript
import { processImageGenerationJobs } from './services/menuVisualAgent/imageGenerationJob.js';

// In startWorker():
console.log('✅ Starting menu image generation worker (30s polling)...');
setInterval(() => {
  processImageGenerationJobs().catch(err => {
    console.error('[MenuVisualAgent] Job error:', err);
  });
}, 30000); // Every 30 seconds
```

**Job Model:** Use existing `OrchestratorTask` or create minimal `ImageGenerationJob` table.

**Minimal Schema (if new table needed):**
```prisma
model ImageGenerationJob {
  id        String   @id @default(cuid())
  storeId   String
  itemIds   Json?    // Array of product IDs, null = all items
  status    String   @default("queued") // "queued" | "running" | "completed" | "failed"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([storeId, status])
}
```

**Recommendation:** Use `OrchestratorTask` to avoid schema migration.

---

### **STEP 7: Integration Points**

#### **7A. After Menu OCR**

**File:** `apps/core/cardbey-core/src/engines/menu/configureMenu.js` (or `.ts`)

**Add at end of function:**
```javascript
// Queue image generation if feature enabled
if (isFeatureEnabled('menu_visual_agent_v1')) {
  queueImageGenerationJob(storeId, createdItemIds).catch(err => {
    console.error('[MenuVisualAgent] Failed to queue job:', err);
    // Non-blocking: log error but don't throw
  });
}
```

**Helper:**
```javascript
async function queueImageGenerationJob(storeId, itemIds) {
  // Create orchestrator task or job record
  // Status: "queued"
}
```

---

#### **7B. After Manual Product Creation**

**File:** `apps/core/cardbey-core/src/routes/productRoutes.js` (or equivalent)

**Add after product creation:**
```javascript
if (isFeatureEnabled('menu_visual_agent_v1') && !product.imageUrl) {
  queueImageGenerationJob(storeId, [product.id]).catch(err => {
    console.error('[MenuVisualAgent] Failed to queue job:', err);
  });
}
```

---

#### **7C. Business Builder Publish**

**File:** `apps/core/cardbey-core/src/routes/businessRoutes.js` (or equivalent)

**No changes needed** - image generation is async and non-blocking.

---

### **STEP 8: Frontend Hooks (Minimal)**

#### **8A. Regenerate Image Button**

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/store-menu/components/MenuItemCard.tsx` (or equivalent)

**Add button:**
```tsx
{isFeatureEnabled('menu_visual_agent_v1') && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => handleRegenerateImage(item.id)}
    disabled={isRegenerating}
  >
    <RefreshCw className="w-4 h-4" />
    Regenerate Image
  </Button>
)}
```

**API Call:**
```typescript
async function handleRegenerateImage(itemId: string) {
  await apiPOST(`/api/menu/regenerate-image`, { itemId });
  // Poll or use SSE for completion
}
```

---

#### **8B. Backend Regenerate Endpoint**

**File:** `apps/core/cardbey-core/src/routes/menuRoutes.js`

**Add:**
```javascript
router.post('/regenerate-image', requireAuth, async (req, res) => {
  const { itemId } = req.body;
  // Queue single-item job
  await queueImageGenerationJob(storeId, [itemId]);
  res.json({ ok: true, message: 'Image regeneration queued' });
});
```

---

#### **8C. Image Status Indicator**

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/store-menu/components/MenuItemCard.tsx`

**Show loading state:**
```tsx
{imageGenerating && (
  <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin" />
  </div>
)}
```

**Polling:** Use `useQuery` with `refetchInterval` or SSE events.

---

### **STEP 9: Environment Variables**

**File:** `.env` (both core and dashboard)

**Add:**
```bash
# Menu Visual Agent
ENABLE_MENU_VISUAL_AGENT=true
UNSPLASH_ACCESS_KEY=your_unsplash_key_here  # Optional
# OPENAI_API_KEY already exists
```

---

### **STEP 10: Testing & Rollout**

#### **10A. Feature Flag Rollout**

1. **Phase 1 (Internal):** `ENABLE_MENU_VISUAL_AGENT=true` for dev/staging
2. **Phase 2 (Beta):** Enable for 10% of users via feature flag
3. **Phase 3 (GA):** Enable for all users

#### **10B. Monitoring**

- Log image generation success/failure rates
- Track API costs (Unsplash + OpenAI)
- Monitor job queue depth
- Alert on high failure rates

---

## 🔗 Dependency Order

1. ✅ **STEP 2** (Feature Flag) - No dependencies
2. ✅ **STEP 3A** (Unsplash Service) - No dependencies
3. ✅ **STEP 3B** (OpenAI Image Service) - Depends on OpenAI package (already installed)
4. ✅ **STEP 4** (Style Presets) - No dependencies
5. ✅ **STEP 5** (MenuVisualAgent) - Depends on Steps 3A, 3B, 4
6. ✅ **STEP 6** (Job Queue) - Depends on Step 5
7. ✅ **STEP 7** (Integration) - Depends on Steps 2, 6
8. ✅ **STEP 8** (Frontend) - Depends on Step 7
9. ✅ **STEP 9** (Env Vars) - Can be done anytime
10. ✅ **STEP 10** (Testing) - After all steps

**Total Estimated Time:** 2-3 days for MVP

---

## ⚠️ Risk Checklist

### **Architecture Risks**

| Risk | Impact | Mitigation |
|------|-------|------------|
| Circular dependencies | High | Keep services in separate files, use dependency injection |
| Job queue overload | Medium | Limit concurrent jobs (max 5), add rate limiting |
| API rate limits hit | Medium | Implement exponential backoff, cache results |
| Database lock on Product updates | Low | Use `updateMany` with `where` clause, batch updates |

### **Legal/Safety Risks**

| Risk | Impact | Mitigation |
|------|-------|------------|
| Unsplash attribution missing | High | Store attribution in `Product.images` JSON, display in UI |
| OpenAI content policy violation | Medium | Sanitize prompts, filter inappropriate items |
| Image copyright issues | Low | Only use API-sourced images (Unsplash license), no scraping |

### **Product Risks**

| Risk | Impact | Mitigation |
|------|-------|------------|
| Images block publish | High | **CRITICAL:** Make async, never block Business Builder |
| Poor image quality | Medium | Allow user regeneration, manual upload override |
| Style mismatch | Low | Use style presets, allow user selection |

### **Performance Risks**

| Risk | Impact | Mitigation |
|------|-------|------------|
| Slow image generation | Medium | Process in background, show placeholders |
| High API costs | Medium | Cache results, limit retries, monitor usage |
| Database bloat | Low | Store URLs only, not binary data |

---

## 🛑 MVP vs Future Upgrades

### **MVP Scope (This Plan)**

✅ Auto-generate images after menu OCR  
✅ Unsplash + OpenAI DALL-E integration  
✅ Style presets from business preferences  
✅ Async job queue (non-blocking)  
✅ Regenerate button in UI  
✅ Feature flag gating  

### **Future Upgrades (Out of Scope)**

❌ User-uploaded image pool  
❌ Image editing/cropping tools  
❌ Supplier image partner program  
❌ AI image style transfer  
❌ Batch style updates  
❌ Image CDN optimization  
❌ Multi-image per product (gallery)  

**Stop Line:** MVP is complete when:
1. Images auto-populate after menu OCR (async)
2. Users can regenerate images
3. Feature flag controls rollout
4. No blocking of Business Builder publish

---

## 📦 Package Dependencies

**New packages needed:**
```json
{
  "unsplash-js": "^7.0.0"  // Unsplash API client
}
```

**Existing packages (no changes):**
- `openai` (already installed)
- `@prisma/client` (already installed)

---

## 🧪 Testing Checklist

- [ ] Feature flag disabled → no image generation
- [ ] Feature flag enabled → images generate after OCR
- [ ] Unsplash API key missing → falls back to OpenAI
- [ ] OpenAI API key missing → logs error, continues
- [ ] Job queue processes jobs correctly
- [ ] Regenerate button works
- [ ] Business Builder publish not blocked
- [ ] Style presets applied correctly
- [ ] Error handling graceful (no crashes)

---

## 📚 File Structure

```
apps/core/cardbey-core/
├── src/
│   ├── services/
│   │   └── menuVisualAgent/
│   │       ├── menuVisualAgent.ts          # Main orchestrator
│   │       ├── unsplashService.ts          # Unsplash API
│   │       ├── openaiImageService.ts       # OpenAI DALL-E
│   │       ├── stylePresets.ts             # Style system
│   │       └── imageGenerationJob.ts       # Job queue
│   ├── routes/
│   │   └── menuRoutes.js                   # Add regenerate endpoint
│   ├── engines/
│   │   └── menu/
│   │       └── configureMenu.js            # Add job queue call
│   └── worker.js                            # Add job processor
└── prisma/
    └── schema.prisma                        # No changes (MVP)

apps/dashboard/cardbey-marketing-dashboard/
└── src/
    └── features/
        └── store-menu/
            └── components/
                └── MenuItemCard.tsx         # Add regenerate button
```

---

## ✅ Approval Criteria

**Planner Agent considers this plan complete when:**
1. All steps are numbered and actionable
2. Dependencies are clear
3. Risks are identified with mitigations
4. MVP scope is defined
5. No breaking changes to existing flows

**Ready for Implementer Agent?** ✅ YES

---

**Next Step:** Pass to **AGENT 2 — IMPLEMENTER** for execution.

