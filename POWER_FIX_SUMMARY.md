# Power Fix Summary - Stability & Correctness

## Completed Fixes

### 1. Fixed `require()` calls → ESM imports
- ✅ `apps/dashboard/cardbey-marketing-dashboard/src/lib/canonicalContext.ts` - Changed `require('./storage')` to `import('./storage.js')`
- ✅ `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` - Changed `require('./canonicalContext')` to top-level import
- ✅ `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` - Changed `require('./getCoreApiBaseUrl')` to top-level import

### 2. Fixed Prisma select fields
- ✅ `apps/core/cardbey-core/src/routes/miRoutes.js` - Removed `storeId` and `tenantId` from Content select (fields don't exist)
- ✅ `apps/core/cardbey-core/src/routes/promoRoutes.js` - Already fixed in previous session

### 3. Fixed hardcoded API URLs
- ✅ `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx` - Changed hardcoded `/api/mi/health` to use `buildApiUrl()`

## Remaining Issues

### Manual/Auto Mode Visual Artifacts
- Selection clearing on mode toggle is already implemented in `ContentStudioEditor.tsx` (line 2552-2557)
- Need to verify transformer/overlay cleanup

### Additional require() calls to fix
- Test files can keep require() (Jest/Node compatible)
- Runtime files need ESM imports

## Manual QA Checklist

- [ ] Load promo content → edit → save → refresh → edits persist
- [ ] Switch 9:16/16:9 → layout preserved  
- [ ] Manual → Auto → no purple edges / no selection box stuck
- [ ] No "require is not defined" errors in browser console
- [ ] No Prisma validation errors on save/publish
- [ ] API calls use correct base URL (check Network tab)


