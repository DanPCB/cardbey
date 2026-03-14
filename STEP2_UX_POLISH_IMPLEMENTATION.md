# Step 2 UX Polish Implementation ✅

## Summary

Polished Store Preview Grid UX to feel like a modern "TikTok/Pexels-style" store profile with minimal, safe changes.

## Files Changed

### Modified Files
1. `apps/dashboard/cardbey-marketing-dashboard/src/components/store/StoreHeader.tsx`
   - Added view mode toggle below header content
   - Made header more compact on mobile (`py-2 md:py-3`)
   - Removed category from header (kept only store name)
   - Toggle styled to match store theme (white/transparent buttons)

2. `apps/dashboard/cardbey-marketing-dashboard/src/layouts/StoreShellLayout.tsx`
   - Added `viewMode` and `onViewModeChange` props
   - Passes view mode to StoreHeader

3. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`
   - Removed view toggle from content area (now in header)
   - Added tile click handler for modal
   - Added TileModal component
   - Passes viewMode to StoreShellLayout

4. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewGrid.tsx`
   - Complete rewrite with new tile assignment system
   - Uses `assignTiles` for deterministic layout
   - Added filler tiles for empty spaces
   - Updated column counts: 2/3/4 (mobile/tablet/desktop)
   - Updated visual grammar: gap 14-18px, border radius 18-24px
   - Added click handler for menu items
   - Simplified tile spans for better dense packing

### New Files
1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/preview/assignTiles.ts`
   - Deterministic tile assignment function
   - Always places: hero first, aboutText second, top 4 menu items, then rest
   - Uses seeded RNG for variety (tall tiles)
   - Pads with filler tiles if needed (minTiles = 12)

2. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/TileModal.tsx`
   - Simple modal for displaying menu item details
   - Shows name, description, price
   - Click outside or X button to close

3. `apps/dashboard/cardbey-marketing-dashboard/src/types/preview.ts`
   - Added `'filler'` to Tile type
   - Added `isTall` and `isWide` optional properties

## Implementation Details

### A) Header Belongs to Store UI ✅

**Layout:**
- Cardbey "C" icon: Absolute far-left (`left-2 md:left-4`)
- Store avatar: Circle, 32-40px (compact on mobile)
- Store name: Only name shown (no slogan, no category in header)
- Breadcrumbs: Right side (Home > StoreName > Preview)
- Header height: Compact on mobile (`py-2`), normal on desktop (`py-3`)

**View Toggle:**
- Moved into header area (below main header row)
- Aligned to content width (same container)
- Styled with store theme (white/transparent buttons)
- Sticky under header (header is sticky, toggle follows)

### B) Grid/List Toggle Placement ✅

**Location:**
- Inside store header area (below store name/breadcrumbs row)
- Right-aligned within content container
- Styled to match store theme (semi-transparent white buttons)

**Responsive:**
- Compact on mobile (icons only, text hidden on small screens)
- Full labels on tablet/desktop

### C) Fill Empty Grid Spaces ✅

**Filler Tile Strategy:**
- Generated when `tiles.length < minTiles` (default 12)
- Type: `'filler'`
- Style:
  - Soft gradient background (store primary color at 8% opacity)
  - Subtle noise pattern overlay (CSS radial gradient dots)
  - Tiny "Generated" label
- Spans: 1 column, 1 row (SQUARE_S)

**No Empty Gaps:**
- Grid uses `grid-auto-flow: dense` to pack tiles
- Filler tiles fill remaining spaces
- No X placeholders or blank holes

### D) Grid Visual Grammar ✅

**Columns:**
- Mobile (< 768px): 2 columns
- Tablet (768-1024px): 3 columns
- Desktop (> 1024px): 4 columns

**Gap:**
- Mobile: 14px
- Tablet/Desktop: 18px

**Border Radius:**
- Mobile: 18px (`rounded-[18px]`)
- Desktop: 24px (`rounded-[24px]`)

**Tile Min Heights:**
- Base row: 120px
- Hero: 2 rows (240px)
- AboutText: 1 row (120px)
- MenuItem: 1 row (120px) or 2 rows (240px) if tall
- Media: 1 row (120px) or 2 rows (240px) if tall
- Filler: 1 row (120px)

**Tile Spans:**
- Hero: 2 columns (md+), full width (mobile), 2 rows
- AboutText: 2 columns (md+), full width (mobile), 1 row
- MenuItem: 1 column, 1 row (or 2 rows if tall)
- Media: 1 column, 1 row (or 2 rows if tall)
- Filler: 1 column, 1 row

### E) AI Tile Assignment ✅

**Deterministic Function: `assignTiles(seed, content)`**

**Order:**
1. Hero (always first)
2. AboutText (always second)
3. Top 4 menu items (featured first, sorted by price)
4. Remaining menu items
5. Media items
6. Filler tiles (if needed to reach minTiles)

**Variety via Seeded RNG:**
- 20% chance for menu items to be tall (RECT_T)
- 30% chance for media items to be tall
- Same seed = same layout every refresh
- Different seed = different pattern

**Guarantee:**
- Total tiles >= minTiles (default 12)
- Padded with filler tiles if needed

### F) Interaction Polish ✅

**Hover States:**
- Tiles: `hover:scale-[1.02]` (slight lift)
- Shadow: `hover:shadow-lg`
- Smooth transitions: `transition-all duration-300`

**Click Handler:**
- Menu items are clickable
- Opens TileModal with:
  - Item name (large, brand color)
  - Description (if available)
  - Price (large, brand color)
- Click outside or X button to close

**Modal:**
- Backdrop blur: `backdrop-blur-sm`
- Semi-transparent overlay: `bg-black/50`
- Centered card with rounded corners
- Click outside to close

## Acceptance Tests

✅ **Grid view has no empty gaps:**
- All spaces filled with tiles or filler tiles
- No X placeholders
- Dense packing with `grid-auto-flow: dense`

✅ **Header shows correctly:**
- Cardbey icon at far-left
- Store avatar + name (no slogan)
- Breadcrumbs on right
- View toggle below header content

✅ **Grid/List toggle in header:**
- Located in store header area
- Right-aligned
- Styled to match store theme

✅ **Small screens look dense:**
- 2 columns on mobile
- Compact header
- Tiles pack tightly
- No wasted space

## Manual Test Steps

1. **Header Layout:**
   - Navigate to `/preview/:draftId`
   - Verify Cardbey "C" icon at far-left
   - Verify store avatar + name (no slogan)
   - Verify breadcrumbs on right
   - Check view toggle below header

2. **Grid Dense Packing:**
   - View grid layout
   - Scroll through tiles
   - Verify no empty gaps
   - Verify filler tiles appear if needed
   - Check responsive: 2/3/4 columns

3. **Tile Interaction:**
   - Click a menu item tile
   - Verify modal opens with details
   - Click outside or X to close
   - Verify hover effects work

4. **Deterministic Layout:**
   - Refresh page 3 times
   - Verify layout stays identical
   - Try different draft → different pattern

## Before/After Notes

**Before:**
- View toggle in content area
- Complex tile size system
- Placeholder tiles causing gaps
- No tile interaction

**After:**
- View toggle in header
- Simplified tile spans (1x1, 1x2, 2x1, 2x2)
- Filler tiles fill gaps
- Clickable tiles with modal
- Dense packing with no empty spaces

## Files Modified

1. `src/components/store/StoreHeader.tsx` - Added view toggle, compact mobile
2. `src/layouts/StoreShellLayout.tsx` - Added viewMode props
3. `src/pages/public/StorePreviewPage.tsx` - Removed toggle from content, added modal
4. `src/components/preview/StorePreviewGrid.tsx` - Complete rewrite with new system
5. `src/lib/preview/assignTiles.ts` - NEW: Deterministic tile assignment
6. `src/components/preview/TileModal.tsx` - NEW: Tile detail modal
7. `src/types/preview.ts` - Added filler type and isTall/isWide

