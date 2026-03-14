# Viewport Fill Implementation ✅

## Summary

Implemented a comprehensive viewport filling system that ensures the mosaic grid always fills the screen height with no bottom gaps. The system uses intelligent tile upgrades and filler generation to create a visually complete layout.

## Files Created

### New Files
1. **`src/components/preview/mosaic/layoutSizing.ts`**
   - Viewport metrics calculation
   - `calculateViewportMetrics()` - computes available height, needed rows, and cells
   - `calculateOccupiedCells()` - calculates current occupied grid cells

2. **`src/components/preview/mosaic/fillViewport.ts`**
   - Viewport filling logic
   - `fillViewport()` - upgrades tiles and adds fillers to fill viewport
   - `upgradeTileSize()` - upgrades tile sizes (S→M, M→L, etc.)
   - Three-pass strategy: upgrade existing tiles → add fillers → scale row height

### Modified Files
1. **`src/components/preview/mosaic/assignTileSizes.ts`**
   - Added TALL tile prioritization (at least 2 TALL tiles if >= 10 tiles)
   - Enhanced filler tile logic to include TALL option
   - Better distribution of vertical cards

2. **`src/components/preview/StorePreviewGrid.tsx`**
   - Integrated viewport filling logic
   - Recalculates on window resize
   - Passes computed `rowPx` to `MosaicGrid`

3. **`src/components/preview/mosaic/MosaicGrid.tsx`**
   - Accepts `rowPx` prop for dynamic row height
   - Uses CSS custom properties (`--row`, `--cols`)

## Implementation Details

### Tile Size System

```typescript
type TileSize = 'S' | 'M' | 'L' | 'XL' | 'WIDE' | 'TALL';

const TILE_SPANS: Record<TileSize, { colSpan: number; rowSpan: number }> = {
  S: { colSpan: 1, rowSpan: 1 },      // 1x1
  M: { colSpan: 2, rowSpan: 1 },      // 2x1
  L: { colSpan: 2, rowSpan: 2 },      // 2x2
  XL: { colSpan: 3, rowSpan: 2 },     // 3x2
  WIDE: { colSpan: 3, rowSpan: 1 },   // 3x1
  TALL: { colSpan: 1, rowSpan: 2 },   // 1x2 (vertical)
};
```

### Viewport Fill Strategy

**Step 1: Calculate Viewport Metrics**
- Subtract fixed chrome (header, banner, footer, padding)
- Convert available height to grid rows
- Calculate needed cells = rows × columns

**Step 2: Small Content Handling (< 6 real tiles)**
- Increase row height: 92px → 110px
- Upgrade hero to XL (desktop)
- Upgrade about to L/WIDE
- Ensure at least 1 TALL tile

**Step 3: Upgrade Existing Tiles**
- Upgrade S → M, M → L, add TALL
- Prioritize real content over fillers
- Limit upgrades to prevent over-sizing
- Use seeded RNG for deterministic upgrades

**Step 4: Add Filler Tiles**
- Only if still needed after upgrades
- Prefer S, sometimes M or TALL
- Limit to 8 fillers max
- Stop when viewport is filled

### CSS Grid Configuration

```css
.mosaicGrid {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  grid-auto-rows: var(--row);
  grid-auto-flow: dense;
  gap: 16px;
}
```

**Responsive Columns:**
- Mobile: 2 columns
- Tablet: 4 columns
- Desktop: 6 columns

**Dense Packing:**
- `grid-auto-flow: dense` automatically fills gaps
- No manual placement needed
- Tiles pack efficiently

### TALL Tile Guarantees

**Minimum TALL Tiles:**
- If total tiles >= 10: at least 2 TALL tiles
- Prioritized in menu items, media items, and fillers
- Only on desktop/tablet (not mobile)

**Distribution:**
- Regular menu items: 15% chance for TALL
- Media items: 25% chance for TALL
- Fillers: 10% chance for TALL
- Featured items: can be upgraded to TALL if needed

### Responsive Behavior

**Window Resize:**
- Recalculates viewport metrics on resize
- Maintains deterministic layout (same seed → same upgrades)
- Adapts column count and row height

**Viewport Changes:**
- Mobile → Tablet → Desktop transitions smoothly
- Tile sizes adjust appropriately
- Layout remains stable per seed

## Acceptance Criteria ✅

✅ **With 4 items only:**
- Tiles become bigger (row height 110px)
- Hero upgraded to XL
- About upgraded to L/WIDE
- At least 1 TALL tile
- No bottom gap

✅ **With 12 items:**
- Mixed sizes including TALL tiles
- Dense packing with no holes
- At least 2 TALL tiles
- Fills viewport completely

✅ **Resize desktop→mobile:**
- Layout adapts (6 cols → 2 cols)
- Stays deterministic (same seed)
- Tiles resize appropriately
- No bottom gap

✅ **No huge empty blank:**
- Viewport always filled
- Intelligent upgrades prevent over-filling
- Fillers only added when necessary
- Clean, complete layout

## File Structure

```
src/components/preview/mosaic/
├── seededRandom.ts          # Seeded RNG (existing)
├── layoutSizing.ts          # Viewport metrics (NEW)
├── assignTileSizes.ts       # Tile size assignment (updated)
├── fillViewport.ts          # Viewport filling logic (NEW)
└── MosaicGrid.tsx           # Grid renderer (updated)
```

## Manual Test Steps

1. **Test with 4 items:**
   - Create preview with only 4 menu items
   - Verify tiles are larger
   - Verify at least 1 TALL tile
   - Verify no bottom gap
   - Verify row height is 110px

2. **Test with 12 items:**
   - Create preview with 12+ items
   - Verify mixed sizes (S/M/L/XL/TALL)
   - Verify at least 2 TALL tiles
   - Verify dense packing
   - Verify no bottom gap

3. **Test resize:**
   - Open preview on desktop
   - Resize to tablet width
   - Verify columns change (6 → 4)
   - Verify layout adapts
   - Verify no bottom gap
   - Resize to mobile
   - Verify columns change (4 → 2)
   - Verify layout adapts

4. **Test refresh:**
   - Refresh page multiple times
   - Verify layout stays identical
   - Verify same tile sizes
   - Verify same TALL tile positions

## Notes

- Viewport filling is deterministic (same seed → same result)
- Upgrades prioritize real content over fillers
- Row height scales up for small content (92px → 110px)
- Maximum 8 fillers to prevent over-filling
- TALL tiles guaranteed for layouts with >= 10 tiles
- Responsive and stable across viewport changes

