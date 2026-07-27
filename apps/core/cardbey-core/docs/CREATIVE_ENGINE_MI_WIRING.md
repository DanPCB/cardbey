# Creative Engine + MI Wiring - Implementation Summary

## Overview

Wired MIEntity into the Creative Engine asset flow (Content Studio) on both backend and frontend.

## Backend Changes

### 1. MI Registration for Creative Assets

**Files Modified:**
- `src/routes/contents.js` - Content Studio CRUD routes

**Routes Updated:**
- `POST /api/contents` - Creates Content and registers MIEntity
- `PUT /api/contents/:id` - Updates Content and updates MIEntity
- `GET /api/contents` - Lists Contents with MIEntity attached
- `GET /api/contents/:id` - Gets single Content with MIEntity attached

**MI Registration Pattern:**
- Uses `miService.registerOrUpdateEntity()` with:
  - `productType: 'creative_asset'`
  - `productId: content.id` (links via productId, not a separate link field)
  - Role inferred from content type:
    - `'menu_page'` - for menu layouts
    - `'social_clip'` - for videos
    - `'ad_poster'` - for static images/posters
    - `'creative_generic'` - fallback
  - Primary intent: `'generic_marketing_asset'` (or from request payload)
  - Channels: `['creative_engine']` (plus `'cnet_screen'` if storeId available)
  - Non-blocking: MI registration errors don't prevent content creation/update

**Helper Functions Created:**
- `src/mi/miCreativeHelpers.ts` - Contains:
  - `inferCreativeRole()` - Infers role from content settings/elements
  - `inferCreativeIntent()` - Infers intent from context
  - `buildCreativeAssetMIBrain()` - Builds complete MIBrain for creative assets

### 2. MIEntity Exposure

**Read Endpoints:**
- `GET /api/contents` - Returns array with `miEntity` field on each content
- `GET /api/contents/:id` - Returns single content with `miEntity` field

**Implementation:**
- Uses `miService.getEntityByProductId()` to fetch MIEntity
- Batched/parallel fetching for list endpoint
- Backward compatible: `miEntity` is additive, existing fields unchanged

## Frontend Changes

### 1. Route Configuration

**Files Modified:**
- `src/layout/Sidebar.tsx` - Updated Creative Engine menu item
- `src/App.jsx` - Route already configured (no changes needed)

**Changes:**
- Sidebar "Creative Engine" menu item now points to `/app/creative-shell` (was `/creative-engine`)

### 2. CreativeEngineShellPage Structure

**Files Modified:**
- `src/pages/CreativeEngineShellPage.tsx`

**Changes:**
- Added `MIInspectorPanel` import
- Added `selectedAsset` state (placeholder for future asset selection)
- Added right sidebar with MI Brain panel:
  ```tsx
  <aside className="w-80 border-l bg-slate-50/60 p-4 overflow-y-auto">
    <MIInspectorPanel entity={selectedAsset?.miEntity ?? null} />
  </aside>
  ```
- Panel currently shows "No MI Brain attached" until asset selection is wired

## Verification Steps

### Backend Check

1. Start core backend
2. Create a new Content via `POST /api/contents`:
   ```powershell
   $headers = @{ Authorization = "Bearer dev-admin-token" }
   $body = @{
     name = "Test Creative Asset"
     elements = @()
     settings = @{}
   } | ConvertTo-Json
   $result = irm "http://192.168.1.12:3001/api/contents" -Method POST -Headers $headers -Body $body -ContentType "application/json"
   ```

3. Verify MIEntity was created:
   ```powershell
   $contents = irm "http://192.168.1.12:3001/api/contents" -Headers $headers
   $contents.data | Select-Object id, name, miEntity | Format-List -Force
   ```
   Should show `miEntity` populated with MI data.

### Frontend Check

1. Open http://localhost:5174/app/creative-shell
2. Confirm header says "Creative Engine"
3. Confirm left sidebar "Creative Engine" menu navigates to `/app/creative-shell`
4. Confirm right sidebar shows MI Brain panel (currently "No MI Brain attached" state)
5. Panel should render without errors

## Follow-up TODOs

### High Priority
1. **Wire Asset Selection** - When a Content/creative asset is selected in the Creative Engine UI, update `selectedAsset` state to show its MIEntity in the panel
2. **Content List Integration** - If there's a content list/library view, ensure it displays MI badges similar to Signage

### Medium Priority
3. **Export to Asset Flow** - When Content is exported to a SignageAsset or MediaAsset, ensure the exported asset also gets MIEntity (may already be handled by Signage routes)
4. **MI Role Refinement** - Improve role inference based on actual content analysis (e.g., detect menu layouts, video content, etc.)

### Low Priority
5. **MI ContentId Link Field** - Consider adding `contentId` link field to MIEntity schema if needed for better querying
6. **MI Panel Enhancements** - Add actions/buttons to MI panel for Creative Engine context (e.g., "Export to Signage", "Use as Template")

## Files Created/Modified Summary

### Created
- `src/mi/miCreativeHelpers.ts` - Creative Engine MI helper functions

### Modified
- `src/routes/contents.js` - Added MI registration and exposure
- `src/layout/Sidebar.tsx` - Updated Creative Engine route
- `src/pages/CreativeEngineShellPage.tsx` - Added MI panel structure

## Notes

- MI registration is non-blocking: Content creation/update succeeds even if MI registration fails
- Uses `productId` to link Content to MIEntity (no separate `contentId` link field in schema)
- Role inference is simple for now; can be enhanced with more sophisticated content analysis
- MI panel is ready but needs asset selection wiring to display real data

## Related Documentation

- **[MI_PROCESS_FLOW.md](./MI_PROCESS_FLOW.md)** - Complete MI process flows for all product types
- **[FILTER_STUDIO_EXPORT_FIX.md](./FILTER_STUDIO_EXPORT_FIX.md)** - FilterStudio export → Content → MIEntity flow
