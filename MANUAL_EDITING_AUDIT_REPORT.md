# Manual Editing Implementation Audit Report

## Current Working Flow Route

**Route**: `/app/creative-shell/edit/:instanceId`  
**Component**: `ContentStudioEditor.tsx`  
**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

**Current State**:
- ✅ Already has `InteractiveCanvas` integrated in `PreviewCanvas.tsx` (lines 326-363)
- ✅ Already has layer editing UI in `PropertiesPanel.tsx`:
  - `LayersPanel` - Lists and manages layers
  - `TextLayerProperties` - Edits text layers
  - `ImageLayerProperties` - Edits image layers
  - `QrLayerProperties` - Edits QR layers
- ✅ Uses `selectedLayerId` state for layer selection
- ✅ Layer-based rendering with `LayerRenderer.tsx`
- ✅ Canvas interactions (click, drag, resize, rotate) via `InteractiveCanvas`

**URL Params Used**:
- `instanceId` (from route params)
- Query params: `source`, `intent`, `returnTo`, `productId`, `storeId`, `imageUrl`, `environment`, `format`, `goal`

## Manual Editor Route (Duplicate - Needs Integration)

**Route**: `/contents`  
**Component**: `ContentsStudio.tsx`  
**File**: `apps/dashboard/cardbey-marketing-dashboard/src/pages/ContentsStudio.tsx`

**Status**: 
- ⚠️ Separate route with Konva-based editor
- ⚠️ Already has redirects configured in `App.jsx` (lines 706-714):
  - `/contents` → `/app/creative-shell?mode=manual`
  - But manual mode isn't fully integrated

**URL Params Used**:
- Different param structure (likely `draftId`, `jobId`)

## Differences

### State Shape
- **ContentStudioEditor**: Uses `instance` state with `draft.data.layers[]` (canonical layer model)
- **ContentsStudio**: Likely uses different state structure (needs verification)

### API Calls
- **ContentStudioEditor**: Uses `/api/contents/:instanceId` (line 270)
- **ContentsStudio**: Unknown (needs verification)

### Canvas Implementation
- **ContentStudioEditor**: Uses `InteractiveCanvas` + `LayerRenderer` (React-based)
- **ContentsStudio**: Uses Konva (canvas library)

## Integration Plan

### Option A: Toggle Button in Header (Recommended)
**Location**: `EditorShell.tsx` header, near aspect ratio toggle and Save/Publish buttons

**Implementation**:
1. Add `isManualMode` state to `ContentStudioEditor.tsx`
2. Add toggle button in `EditorShell.tsx` header
3. When enabled:
   - Show layer editing UI in PropertiesPanel (already exists)
   - Enable `InteractiveCanvas` interactions (already integrated)
   - Keep MI steps intact (Khuyến mãi / Sản phẩm / Call to Action)

### Option B: Tab in PropertiesPanel
**Location**: Add new tab next to "Content" / "Behavior" / "Deploy"

**Implementation**:
1. Add "Manual Edit" tab to PropertiesPanel tabs
2. Show layer editing UI when tab is active
3. Less visible, requires more clicks

**Recommendation**: **Option A** - More discoverable, single click to enable

## Files to Modify

1. **`ContentStudioEditor.tsx`**
   - Add `isManualMode` state
   - Pass `isManualMode` to `EditorShell` and `PropertiesPanel`
   - Ensure `InteractiveCanvas` is always enabled when layers exist (already done)

2. **`EditorShell.tsx`**
   - Add "Manual Edit" toggle button in header
   - Position near aspect ratio toggle (9:16 / 16:9) and Save/Publish

3. **`PropertiesPanel.tsx`**
   - Already has layer editing UI - no changes needed
   - Ensure it's visible when `isManualMode` is true

4. **`PreviewCanvas.tsx`**
   - Already has `InteractiveCanvas` integration - no changes needed

## Guardrails

1. **Remove/Redirect Duplicate Route**:
   - `/contents` route already redirects to `/app/creative-shell?mode=manual`
   - Verify redirect works correctly
   - Add comment: "Single source of truth for manual editing: /app/creative-shell/edit/:instanceId"

2. **No Relative API Calls**:
   - Verify all API calls use `getCoreApiBaseUrl()` or `apiGET`/`apiPOST` helpers
   - Check `ContentStudioEditor.tsx` line 270: `apiGET(\`/api/contents/${instanceId}\`)` - uses helper ✅

3. **Single Source of Truth**:
   - All manual editing happens in `ContentStudioEditor.tsx`
   - No duplicate editor implementations

## Acceptance Criteria

- ✅ From Store → Product → Promotion → Content Studio, user can click Manual Edit without leaving the page
- ✅ Manual edits update the same preview (no second canvas)
- ✅ Save persists edited creative and reload works
- ✅ Publish still works
- ✅ No duplicate editor routes/flows remain
- ✅ No relative /api calls introduced; use canonical base resolver

