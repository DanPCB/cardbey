# Mosaic Grid with Variable Tile Sizes Implementation ✅

## Summary

Implemented a TikTok/Pexels-style mosaic grid layout with variable tile sizes (S, M, L, XL, WIDE, TALL) that creates a visually dynamic, dense layout. The system uses deterministic randomness to ensure the same store/draft always produces the same layout.

## Files Created

### New Files
1. **`src/components/preview/mosaic/seededRandom.ts`**
   - Mulberry32 seeded random number generator
   - Helper functions: `randomChoice`, `weightedChoice`
   - Ensures deterministic randomness based on seed (storeId/draftId)

2. **`src/components/preview/mosaic/assignTileSizes.ts`**
   - Tile size assignment logic
   - Defines `TileSize` type: 'S' | 'M' | 'L' | 'XL' | 'WIDE' | 'TALL'
   - `TILE_SPANS` mapping for column/row spans
   - `assignTileSizes()` function with smart defaults and constraints

3. **`src/components/preview/mosaic/MosaicGrid.tsx`**
   - Main mosaic grid component
   - Renders tiles with variable sizes using CSS Grid
   - Responsive: 2 columns (mobile), 4 columns (tablet), 6 columns (desktop)
   - Uses `grid-auto-flow: dense` for automatic gap filling

### Modified Files
1. **`src/components/preview/StorePreviewGrid.tsx`**
   - Refactored to use `MosaicGrid` component
   - Calls `assignTileSizes()` to assign sizes to tiles
   - Passes sized tiles to `MosaicGrid` for rendering

## Implementation Details

### Tile Size Grammar

```typescript
type TileSize = 'S' | 'M' | 'L' | 'XL' | 'WIDE' | 'TALL';

const TILE_SPANS: Record<TileSize, { colSpan: number; rowSpan: number }> = {
  S: { colSpan: 1, rowSpan: 1 },      // 1x1
  M: { colSpan: 2, rowSpan: 1 },      // 2x1
  L: { colSpan: 2, rowSpan: 2 },      // 2x2
  XL: { colSpan: 3, rowSpan: 2 },     // 3x2
  WIDE: { colSpan: 3, rowSpan: 1 },   // 3x1
  TALL: { colSpan: 1, rowSpan: 2 },   // 1x2
};
```

### Layout Engine

**CSS Grid Configuration:**
- Desktop: 6 columns
- Tablet: 4 columns
- Mobile: 2 columns
- `grid-auto-flow: dense` - automatically fills gaps
- `grid-auto-rows: 92px` (mobile), `96px` (tablet), `100px` (desktop)
- `gap: 16px` (consistent across viewports)

**Dense Packing:**
- CSS Grid's `dense` flow automatically places tiles in optimal positions
- Fills empty spaces without manual placement logic
- Each tile sets `gridColumn: span colSpan` and `gridRow: span rowSpan`

### Tile Size Assignment Rules

**Hero Tile:**
- Desktop: XL (3x2)
- Tablet: L (2x2)
- Mobile: M (2x1)

**About/Welcome Tile:**
- Desktop: WIDE (3x1) or L (2x2) - weighted 60/40
- Tablet: L (2x2)
- Mobile: M (2x1)
- Never small

**Featured Menu Items (Top 1-2):**
- Desktop/Tablet: L (2x2) if within large tile limit
- Otherwise: M (2x1)
- Mobile: M (2x1)

**Regular Menu Items:**
- Mix of M (2x1) and S (1x1)
- Preference for S to maintain mosaic feel (70% S, 30% M)
- Ensures at least 40% of tiles are small

**Media Items:**
- 10% chance for TALL (1x2) on desktop/tablet (if within limits)
- Otherwise: M (2x1) or S (1x1) - weighted 40/60

**Filler Tiles:**
- Mostly S (1x1) - 80% chance
- Sometimes M (2x1) - 20% chance
- Improved styling with subtle pattern and sparkle icon

### Constraints & Safety Rules

1. **Large Tile Limit:**
   - Maximum 30% of tiles can be large (L/XL/WIDE/TALL)
   - Prevents overwhelming layouts

2. **Small Tile Minimum:**
   - At least 40% of tiles must be small (S)
   - Preserves "mosaic" feeling

3. **Reduced Sizes for Small Grids:**
   - If total tiles < 8, no XL tiles
   - Prevents layout from being too sparse

4. **Deterministic Randomness:**
   - Uses seeded RNG with `storeId` or `draftId` as seed
   - Same seed always produces same layout
   - Refresh page → same layout

### Improved Filler Tiles

**Visual Design:**
- Subtle gradient background (30% opacity brand colors)
- Dotted pattern overlay (10% opacity)
- Sparkle icon (lucide-react `Sparkles`)
- "Generated" label (light, subtle text)
- Not louder than real content

## Responsive Behavior

**Mobile (< 768px):**
- 2 columns
- Row height: 92px
- Hero: M (2x1)
- About: M (2x1)
- Most tiles: S (1x1) or M (2x1)

**Tablet (768px - 1024px):**
- 4 columns
- Row height: 96px
- Hero: L (2x2)
- About: L (2x2)
- Mix of S, M, L tiles

**Desktop (> 1024px):**
- 6 columns
- Row height: 100px
- Hero: XL (3x2)
- About: WIDE (3x1) or L (2x2)
- Full range of tile sizes

## Acceptance Criteria ✅

✅ **Tiles render with visibly different sizes:**
- Hero tile is largest (XL on desktop)
- Featured items are medium-large (L)
- Regular items are small-medium (S/M)
- Filler tiles are small (S)

✅ **Layout looks dense:**
- CSS Grid `dense` flow fills gaps automatically
- No awkward empty spaces
- Tiles pack efficiently

✅ **Responsive columns switch correctly:**
- Mobile: 2 columns
- Tablet: 4 columns
- Desktop: 6 columns
- Tile spans adjust accordingly

✅ **Deterministic layout:**
- Same storeId/draftId → same layout
- Refresh page → layout stays identical
- Uses seeded RNG for consistency

✅ **Tile click → gallery modal:**
- All tiles remain clickable
- Opens gallery modal with correct slide
- Integration with existing gallery modal works

## File Structure

```
src/components/preview/
├── StorePreviewGrid.tsx          # Main grid component (refactored)
├── mosaic/
│   ├── seededRandom.ts           # Seeded RNG utilities
│   ├── assignTileSizes.ts       # Tile size assignment logic
│   └── MosaicGrid.tsx            # Mosaic grid renderer
└── ...
```

## Manual Test Steps

1. **Open Preview:**
   - Navigate to `/preview/:draftId`
   - Verify grid shows variable tile sizes

2. **Check Responsive:**
   - Resize browser window
   - Verify columns change (2 → 4 → 6)
   - Verify tile sizes adjust appropriately

3. **Verify Deterministic:**
   - Refresh page multiple times
   - Verify layout stays identical
   - Try different stores/drafts
   - Verify each has unique but stable layout

4. **Check Dense Packing:**
   - Verify no large empty gaps
   - Verify tiles fill available space
   - Verify filler tiles blend in nicely

5. **Test Tile Clicks:**
   - Click any tile
   - Verify gallery modal opens
   - Verify correct slide is shown

## Notes

- Tile sizes are assigned deterministically but appear "random"
- Layout uses CSS Grid's dense flow for automatic gap filling
- No manual placement logic needed - Grid handles it
- Filler tiles are intentionally subtle and lightweight
- All constraints ensure visually pleasing layouts

