# Grid/List Preview with AI-Informed Tile Assignment ✅

## Summary

Implemented a sophisticated Grid/List preview system with deterministic tile assignment and masonry-style layout for the Store Preview page. The system uses AI-informed heuristics to assign tile types and ensures consistent, visually appealing layouts.

## Files Changed

### New Files Created
1. `apps/dashboard/cardbey-marketing-dashboard/src/types/preview.ts`
   - Type definitions for PreviewItem, TileType, PlannedTile
   - Content types: hero, video, image, text, product, menu, campaign

2. `apps/dashboard/cardbey-marketing-dashboard/src/lib/preview/assignTileTypes.ts`
   - Tile assignment engine with deterministic randomness
   - Importance and confidence scoring
   - Normalization of preview data to PreviewItem array

3. `apps/dashboard/cardbey-marketing-dashboard/src/lib/preview/planGridLayout.ts`
   - Grid layout planner with guardrails
   - Masonry column algorithm
   - Prevents ugly clustering

### Modified Files
1. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`
   - Added localStorage persistence for viewMode
   - View toggle already present (from user's changes)

2. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewGrid.tsx`
   - Complete rewrite using new tile assignment system
   - Responsive grid layout (2 cols mobile, 3 cols desktop)
   - Renders HERO, WIDE, TALL, SQUARE tiles

3. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewList.tsx`
   - No changes needed (already simple and fast)

## Implementation Details

### 1. View Toggle with Persistence
- **Location:** `StorePreviewPage.tsx`
- **Feature:** localStorage key `cardbey.preview.viewMode`
- **Default:** Grid view
- **Behavior:** Persists across page refreshes

### 2. Data Model (PreviewItem)
- Normalized array from preview data
- Computed fields: `importance`, `confidence`, `aspectRatio`
- UI roles: `hero_intro`, `featured_offer`, `normal`, `supporting`

**Importance Heuristic:**
- `hero_intro` = 1.0
- Has image/video = +0.2
- Campaign/promo = +0.2
- First N menu items = +0.1
- Clamped to 0..1

**Confidence Heuristic:**
- Has image/video => 0.8
- Text only => 0.6
- Missing fields => 0.4

### 3. Tile Assignment Engine
**File:** `assignTileTypes.ts`

**Logic:**
- **Desired mix per ~12 items:**
  - HERO: 1-2
  - WIDE: 1-2
  - TALL: 2-3
  - SQUARE: rest

**Adjustments:**
- If video ratio > 0.35 => +1 TALL, -1 SQUARE
- If text ratio > 0.35 => +1 WIDE (max 2), -1 TALL

**Hard Rules:**
- HERO only if `importance >= 0.75` and `confidence >= 0.65`
- TALL preferred for video or `aspectRatio <= 0.8`
- WIDE preferred for text/campaign or `aspectRatio >= 1.5`
- Default: SQUARE

**Deterministic Randomness:**
- Uses Mulberry32 RNG seeded with store name
- Same storeId yields same layout on refresh
- Different storeId yields different pattern
- RNG only used for tie-breaks within same tile type

### 4. Placement Planner
**File:** `planGridLayout.ts`

**Algorithm:**
- Masonry columns approach
- Maintains column heights
- Places each tile into column with smallest height increase

**Tile Sizes (Desktop):**
- HERO: spans 2 columns, height = 2 units
- WIDE: spans 2 columns, height = 1 unit
- TALL: spans 1 column, height = 2 units
- SQUARE: spans 1 column, height = 1 unit

**Guardrails:**
- ✅ No HERO directly after HERO
- ✅ Max 2 TALL adjacent (downgrade next to SQUARE)
- ✅ Max 1 WIDE per 8 items (downgrade to SQUARE if exceeded)

**Responsive:**
- Mobile (2 cols): HERO/WIDE span 2 cols
- Desktop (3 cols): HERO spans 2 cols only

### 5. Grid View UI
**File:** `StorePreviewGrid.tsx`

**Features:**
- CSS Grid with `grid-template-columns: repeat(2/3, minmax(0, 1fr))`
- `grid-auto-rows: 120px` (mobile) / `140px` (desktop)
- Tile height = `rowSpan * autoRows`

**Tile Rendering:**
- **HERO:** Brand header card (name, type, slogan, intro)
- **Product/Menu:** Card with name + price + description
- **Video/Image:** Cover thumbnail with play icon for video
- **Featured items:** Highlighted with brand colors

**Visual Design:**
- Bright, clear, simple aesthetic
- Uses existing brand colors
- Smooth hover transitions
- Responsive to viewport

### 6. List View UI
**File:** `StorePreviewList.tsx`
- No changes (already simple and fast)
- Shows menu items in structured list

### 7. No Auth Calls
- ✅ Verified: No `/api/auth/me` calls in `StorePreviewPage.tsx`
- ✅ Preview route works for guests
- ✅ All logic is client-side

## Manual Test Checklist

### Test 1: View Toggle
- [ ] Open `/features` → generate → land on preview
- [ ] Toggle between Grid/List views
- [ ] Refresh page → verify view mode persists
- [ ] Check localStorage: `cardbey.preview.viewMode` should be set

### Test 2: Deterministic Layout
- [ ] Hard refresh 3 times on same preview
- [ ] Grid arrangement should stay identical
- [ ] Different draftId should yield different pattern

### Test 3: Responsive Behavior
- [ ] Resize browser window (mobile ↔ desktop)
- [ ] Columns should change (2 ↔ 3)
- [ ] Pattern should remain stable
- [ ] Tiles should resize appropriately

### Test 4: No Auth Calls
- [ ] Open DevTools → Network tab
- [ ] Filter: `/api/auth/me`
- [ ] Load preview page (logged out)
- [ ] Should see NO `/api/auth/me` requests

### Test 5: Guardrails
- [ ] Verify no two HERO tiles are adjacent
- [ ] Verify max 2 TALL tiles in a row
- [ ] Verify WIDE tiles are spaced (max 1 per 8 items)

### Test 6: Content Types
- [ ] Hero intro appears as HERO tile
- [ ] Images appear as TALL or SQUARE
- [ ] Menu items appear as SQUARE or WIDE
- [ ] Featured items (first 3) are highlighted

## Assignment + Planner Logic Summary

### Assignment Logic
1. **Normalize** preview data into PreviewItem array
2. **Compute** importance and confidence scores
3. **Determine** desired tile mix based on content ratios
4. **Assign** tiles using hard rules (HERO → TALL → WIDE → SQUARE)
5. **Shuffle** within same tile type using deterministic RNG

### Planner Logic
1. **Initialize** column heights array
2. **For each tile:**
   - Apply guardrails (no adjacent HERO, max TALL, max WIDE)
   - Map tile type to grid dimensions
   - Find column with smallest height
   - Place tile and update column heights
3. **Return** planned tiles with positioning

## TODOs (Minimal)

- [ ] Optional: Add actual image dimension detection for better aspectRatio
- [ ] Optional: Add lightbox/detail panel for tile clicks
- [ ] Optional: Add animation on tile hover/click

## Acceptance Criteria Met

✅ **View Toggle:**
- Toggle visible above content
- Persists to localStorage
- Switching doesn't refetch data

✅ **Data Model:**
- Normalized PreviewItem array
- Computed importance/confidence
- All content types supported

✅ **Tile Assignment:**
- Deterministic (same seed = same layout)
- AI-informed (importance/confidence based)
- Hard rules enforced

✅ **Placement Planner:**
- Masonry columns algorithm
- Guardrails prevent ugly clustering
- Responsive (2/3 columns)

✅ **Grid View:**
- Clean, bright, simple design
- Uses brand colors
- Responsive layout

✅ **No Auth Calls:**
- Preview works for guests
- No `/api/auth/me` requests

## Performance Notes

- All computations are memoized with `useMemo`
- Tile assignment runs once per preview data change
- Layout planning is O(n) where n = number of items
- No expensive operations in render loop

