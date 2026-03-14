# Pexels Image Search Integration Audit

## Status: **ACTIVE AND WIRED**

### Integration Points

1. **API Key Configuration**
   - **File**: `apps/core/cardbey-core/src/services/imageSearch/pexels.ts`
   - **Line**: 6
   - **Code**: `const PEXELS_API_KEY = process.env.PEXELS_API_KEY;`
   - **Fallback**: Returns empty array if key missing (graceful)

2. **Search Function**
   - **File**: `apps/core/cardbey-core/src/services/imageSearch/pexels.ts`
   - **Functions**: 
     - `searchPexelsImages(query, options)` - Returns array of image URLs
     - `getProductImageUrl(productName, category, tags)` - Returns single URL or null
   - **API Endpoint**: `https://api.pexels.com/v1/search`
   - **Authorization**: Header `Authorization: <PEXELS_API_KEY>`

3. **Usage in Pipeline**
   - **File**: `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`
   - **Line**: 124
   - **Function**: `generateSeedCatalog()`
   - **Stage**: `seed_catalog`
   - **Code**: 
     ```typescript
     imageUrl = await getProductImageUrl(template.name, categories[0]?.name, template.tags);
     ```
   - **Mapping**: Result assigned to `product.imageUrl` (line 138)
   - **Fallback**: If Pexels fails, `imageUrl` remains `null` (line 120-130)

4. **Frontend Proxy**
   - **File**: `apps/dashboard/cardbey-marketing-dashboard/src/lib/api/assets.ts`
   - **Function**: `searchPexelsPhotos()` - Proxies through Core API
   - **Endpoint**: `/api/assets/photos` (Core routes to Pexels)

### Graceful Fallback Behavior

- ✅ **Missing API Key**: Returns empty array, products created with `imageUrl=null`
- ✅ **API Request Fails**: Catches errors, returns empty array, products continue without images
- ✅ **UI Handling**: ProductCard and ProductReviewCard show placeholders when `imageUrl` is null

### Log Markers

**Development-only logs:**
- `[IMAGE_PROVIDER] provider=pexels query="..." results=N` - When Pexels search succeeds
- `[SEED_CATALOG][CREATED] count=N categories=M images=K provider=pexels|fallback` - After catalog generation
- `[Pexels] API key not configured` - Warning when key missing

### Runtime Verification

To confirm Pexels is active at runtime, check for:
1. Log marker: `[IMAGE_PROVIDER] provider=pexels` in backend console
2. Log marker: `[SEED_CATALOG][CREATED] provider=pexels` (not "fallback")
3. Products have non-null `imageUrl` values after seed_catalog stage

### Next Actions

1. **Optional**: Add `PEXELS_API_KEY` to backend `.env` if real images desired
2. **UI**: Already handles null images with placeholders (no changes needed)
3. **Integration**: Single point at `seedCatalogService.ts` - no scattered calls

### Files Summary

- **Service**: `apps/core/cardbey-core/src/services/imageSearch/pexels.ts`
- **Integration**: `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`
- **Frontend Proxy**: `apps/dashboard/cardbey-marketing-dashboard/src/lib/api/assets.ts`
- **Static Mock**: `apps/core/cardbey-core/src/routes/assets.js` (dev fallback)






