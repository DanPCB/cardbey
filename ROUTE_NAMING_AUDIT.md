# Route Naming Audit - `/mi/orchestrator` vs `/mi/orchestra`

**Date:** 2026-01-12  
**Issue:** Split-brain naming between `/api/mi/orchestrator` and `/api/mi/orchestra`  
**Status:** ⚠️ **IDENTIFIED - NEEDS DECISION**

---

## 🔍 Current State

### Backend Routes (mounted at `/api/mi`)

**Pattern 1: `/orchestrator/...` (Template/Suggestion Services)**
- `GET /api/mi/orchestrator/templates/suggestions` (line 337)
- `POST /api/mi/orchestrator/templates/:templateId/instantiate` (line 455)
- `POST /api/mi/orchestrator/templates/generate` (line 543)
- `GET /api/mi/orchestrator/signage-playlists/:playlistId/suggestions` (line 260)

**Pattern 2: `/orchestra/...` (Job Orchestration Pipeline)**
- `POST /api/mi/orchestra/infer` (line 619)
- `POST /api/mi/orchestra/start` (line 734)
- `GET /api/mi/orchestra/job/:jobId` (line 1617)
- `GET /api/mi/orchestra/job/:jobId/next-actions` (line 1782)
- `POST /api/mi/orchestra/job/:jobId/run` (line 1845)
- `POST /api/mi/orchestra/job/:jobId/sync-store` (line 2040)
- `GET /api/mi/orchestra/job/by-store/:storeId` (line 3250)

### Frontend Usage

**Uses `/api/mi/orchestrator/...`:**
- `GET /api/mi/orchestrator/templates/suggestions` (ProductSuggestions.tsx, api.ts)

**Uses `/api/mi/orchestra/...`:**
- `POST /api/mi/orchestra/infer` (quickStart.ts)
- `POST /api/mi/orchestra/start` (quickStart.ts, StoreReviewPage.tsx, StoreDraftReview.tsx)
- `POST /api/mi/orchestra/job/:jobId/sync-store` (StoreReviewPage.tsx, StoreDraftReview.tsx)
- `GET /api/mi/orchestra/job/:jobId` (useOrchestraJob.ts, etc.)

---

## 🎯 Analysis

### Current Pattern (Intentional?)

The split appears intentional:
- **`/orchestrator`** = Template/suggestion services (read-only, public suggestions)
- **`/orchestra`** = Job orchestration pipeline (stateful, job management)

### Problems

1. **Confusion:** Two similar names (`orchestrator` vs `orchestra`) for related functionality
2. **Maintenance Risk:** Easy to mix up when adding new routes
3. **Documentation:** Harder to explain which endpoint goes where
4. **AI Confusion:** Cursor/LLMs may suggest wrong paths

### Recommendation

**Option A: Unify to `/orchestra` (Recommended)**
- Rename `/orchestrator/templates/*` → `/orchestra/templates/*`
- Rename `/orchestrator/signage-playlists/*` → `/orchestra/signage-playlists/*`
- Keep all job endpoints as `/orchestra/job/*`
- **Pros:** Single namespace, clearer, less confusion
- **Cons:** Breaking change for template endpoints

**Option B: Unify to `/orchestrator`**
- Rename `/orchestra/*` → `/orchestrator/*`
- **Pros:** More descriptive name
- **Cons:** Breaking change for all job endpoints (more impact)

**Option C: Keep Split (Not Recommended)**
- Document the distinction clearly
- Add route validation to prevent typos
- **Pros:** No breaking changes
- **Cons:** Ongoing confusion, maintenance burden

---

## 📊 Impact Assessment

### If We Choose Option A (Unify to `/orchestra`)

**Backend Changes:**
- `miRoutes.js`: Rename 4 routes from `/orchestrator/*` to `/orchestra/*`

**Frontend Changes:**
- `api.ts`: Update `getTemplateSuggestions()` function
- `ProductSuggestions.tsx`: Update endpoint URL
- Any other files using template endpoints

**Breaking Change:** Yes (but only for template endpoints, which are less frequently used)

---

## ✅ Recommendation

**Choose Option A: Unify to `/orchestra`**

**Reasoning:**
1. `/orchestra` is shorter and already used for the majority of endpoints
2. Job orchestration is the primary use case
3. Template endpoints are secondary/helper services
4. Less breaking change (only 4 template routes vs 7 job routes)

**Migration Plan:**
1. Add backward compatibility aliases for template endpoints
2. Update frontend to use new paths
3. Deprecate old paths with warnings
4. Remove old paths after migration period

---

## 📝 Next Steps

1. **Decision:** Choose Option A, B, or C
2. **Implementation:** If Option A, create migration plan
3. **Testing:** Verify all endpoints work with new paths
4. **Documentation:** Update API docs with unified naming

