# Store Preview Grid View Implementation ✅

## Summary

Implemented a visually exciting Grid View for Store Preview with TikTok/Pexels feed vibe, unequal tile sizes, deterministic layout, and store-branded UI. The system uses a layout policy interface that can be extended with AI in the future.

## Files Changed

### New Files Created
1. `apps/dashboard/cardbey-marketing-dashboard/src/utils/prng.ts`
   - Seeded random number generator (Mulberry32)
   - Helper functions: `randomInt`, `randomChoice`, `weightedChoice`

2. `apps/dashboard/cardbey-marketing-dashboard/src/lib/preview/previewLayout.ts`
   - Layout policy interface (`LayoutPolicy`)
   - Default heuristic policy (`defaultHeuristicPolicy`)
   - Content normalization (`normalizePreviewContent`)
   - Tile generation (`generatePreviewTiles`)
   - Future AI hook stub (`getAiLayoutSuggestion`)

### Modified Files
1. `apps/dashboard/cardbey-marketing-dashboard/src/types/preview.ts`
   - Updated tile types: `MEDIA`, `TEXT`, `PRODUCT`, `CTA`
   - Updated tile sizes: `SQUARE_S`, `SQUARE_M`, `WIDE`, `TALL`, `HERO`
   - Viewport configuration types

2. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewGrid.tsx`
   - Complete rewrite with visual grammar compliance
   - 3/4/6 column responsive grid
   - Base row heights: 84px (mobile), 96px (tablet), 110px (desktop)
   - Gap: 12px (mobile), 16px (tablet/desktop)
   - Tile rendering for MEDIA, TEXT, PRODUCT, CTA

3. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewActionRail.tsx`
   - Updated buttons: Home, Promotions, Menu, Favorites, Share, Link
   - Toast notifications for actions
   - Scroll-to-section functionality

4. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`
   - Store-branded sticky header with logo/avatar
   - Container max-width: `max-w-[980px]` on desktop
   - Skeleton loading state
   - View mode persistence: `localStorage.cardbey.preview.view`
   - Sticky footer on mobile

## Visual Grammar Implementation

### Container
- **Desktop:** `max-w-[980px]`, centered
- **Mobile:** Full width
- **Padding:** `px-4 py-6 md:py-8`

### Grid System
- **Mobile (< 640px):** 3 columns
- **Tablet (640-1024px):** 4 columns
- **Desktop (> 1024px):** 6 columns
- **Gap:** `gap-3` (12px) mobile, `gap-4` (16px) tablet/desktop
- **Flow:** `grid-auto-flow: dense`

### Row Heights
- **Mobile:** 84px base row height
- **Tablet:** 96px base row height
- **Desktop:** 110px base row height

### Tile Sizes
- **SQUARE_S:** `col-span-1 row-span-1` (1x1)
- **SQUARE_M:** `col-span-2 row-span-2` (2x2)
- **WIDE:** `col-span-2 row-span-1` (2x1)
- **TALL:** `col-span-1 row-span-2` (1x2)
- **HERO:** `col-span-3 row-span-2` (3x2, only >= 4 columns)

### Tile Styling
- **Background:** `bg-white`
- **Radius:** `rounded-2xl`
- **Shadow:** `shadow-sm hover:shadow-md`
- **Border:** `border border-slate-200/70`
- **Hover:** `hover:-translate-y-0.5` (slight lift) + pointer cursor

## Layout Algorithm

### Content Normalization
1. **About/Welcome text** → Highest priority (100)
2. **Media items** → Priority 30
3. **Product items** → Priority 50 (featured) or 10 (normal)
4. Featured detection: Price > median price

### Tile Assignment Rules

**Kind Selection:**
- Media URL → `MEDIA`
- About/Text type → `TEXT`
- Product type → `PRODUCT`

**Size Selection:**
- **MEDIA:**
  - Wide aspect ratio (>= 1.5) → `WIDE` or `SQUARE_M`
  - Tall aspect ratio (<= 0.8) → `TALL` or `SQUARE_M`
  - Default → `SQUARE_M` or `SQUARE_S`
  
- **TEXT:**
  - About text + >= 4 columns → `HERO` or `WIDE`
  - Default → `WIDE` or `SQUARE_M`
  
- **PRODUCT:**
  - Featured → Weighted: `SQUARE_M` (40%), `WIDE` (30%), `TALL` (20%), `SQUARE_S` (10%)
  - Normal → Weighted: `SQUARE_S` (50%), `TALL` (30%), `WIDE` (20%)

### Constraints & Guardrails
1. **HERO constraints:**
   - Only available on >= 4 columns
   - Max 2 HERO tiles per grid
   - First tile priority (about text)

2. **Cooldown system:**
   - After HERO or SQUARE_M → cooldown = 2
   - During cooldown → prefer smaller sizes (SQUARE_S, WIDE, TALL)

3. **Distribution:**
   - If media exists: Target 40-60% MEDIA tiles
   - Else: PRODUCT 60-80%, TEXT 20-40%

### Deterministic Randomness
- **Seed:** `draftId || storeName || 'default'`
- **PRNG:** Mulberry32 implementation
- Same seed → same layout every refresh
- Different seed → different pattern

## Store-Branded UI

### Header
- **Sticky** on mobile
- **Background:** Gradient using `primaryColor` and `secondaryColor`
- **Logo/Avatar:** First letter of store name in rounded square
- **Content:** Store name, type, slogan
- **Max-width:** `max-w-[980px]`

### Action Rail
- **Desktop/Tablet:** Fixed right, vertically centered
- **Buttons:** Home, Promotions, Menu, Favorites, Share, Link
- **Mobile:** Floating share button (mid-right)
- **Functionality:**
  - Home → Scroll to hero
  - Promotions → Scroll to featured + toast
  - Menu → Scroll to menu section
  - Favorites → Toast (coming soon)
  - Share → Native share or copy to clipboard
  - Link → Copy to clipboard

### Footer
- **Sticky** on mobile
- **Buttons:** "Save Draft & Create Account" (primary), "Start Over" (secondary)
- **Background:** White with backdrop blur

## Skeleton Loading

- Shimmering grid with 12 placeholder tiles
- Random heights for visual variety
- Matches grid structure (3/4/6 columns)

## Testing Checklist

### Visual Grammar
- [ ] Container max-width 980px on desktop
- [ ] 3 columns mobile, 4 tablet, 6 desktop
- [ ] Gap: 12px mobile, 16px tablet/desktop
- [ ] Row heights: 84px/96px/110px
- [ ] Tiles: rounded-2xl, shadow-sm, hover effects

### Layout Determinism
- [ ] Refresh 3x → same layout
- [ ] Different draftId → different pattern
- [ ] Same draftId → same pattern

### Responsive
- [ ] Mobile: 3 columns, readable tiles
- [ ] Tablet: 4 columns
- [ ] Desktop: 6 columns
- [ ] No overflow, no layout shift

### Store Branding
- [ ] Header uses brand colors
- [ ] Logo/avatar shows first letter
- [ ] Action rail visible and functional
- [ ] Footer sticky on mobile

### Tile Types
- [ ] MEDIA tiles show images/videos with play icon
- [ ] TEXT tiles show about/welcome content
- [ ] PRODUCT tiles show name, description, price
- [ ] Featured products highlighted

### Functionality
- [ ] View toggle: Grid (default) / List
- [ ] View mode persists in localStorage
- [ ] Action rail buttons work
- [ ] Footer buttons functional
- [ ] Skeleton shows during generation

## Future AI Integration

The layout policy interface is ready for AI integration:

```typescript
// Stub function (not called unless feature flag enabled)
async function getAiLayoutSuggestion({ storeId, items }) {
  // Future: Call AI service to get layout hints
  return { hints: [] };
}
```

To enable AI:
1. Set feature flag: `flags.aiLayout = true`
2. Implement `getAiLayoutSuggestion` to call AI service
3. Merge AI hints with heuristic policy

## Acceptance Criteria Met

✅ **Visual Grammar:**
- Container max-width 980px desktop
- 3/4/6 column responsive grid
- Base row heights: 84/96/110px
- Gap: 12px/16px
- Tile sizes: 1x1, 2x2, 2x1, 1x2, 3x2
- Styling: rounded-2xl, shadow-sm, hover effects

✅ **Deterministic Layout:**
- Seeded PRNG (Mulberry32)
- Same seed → same layout
- Constraints and guardrails enforced

✅ **Tile Types:**
- MEDIA (image/video with play icon)
- TEXT (about/welcome with clamp)
- PRODUCT (name, description, price, featured tag)
- CTA (placeholder)

✅ **Store Branding:**
- Sticky header with brand colors
- Logo/avatar
- Action rail with 6 buttons
- Sticky footer on mobile

✅ **Layout Policy:**
- Interface ready for AI extension
- Heuristic rules implemented
- Future AI hook stubbed

✅ **Skeleton Loading:**
- Shimmering grid during generation
- Matches grid structure

## Manual Test Steps

1. **Generate Store:**
   - Go to `/features`
   - Click "Generate"
   - Wait for preview to load

2. **Grid View:**
   - Verify grid appears by default
   - Check tile sizes are varied
   - Verify responsive columns (resize window)

3. **Deterministic:**
   - Refresh page 3 times
   - Verify layout stays identical
   - Try different draft → different pattern

4. **Store Branding:**
   - Check header uses brand colors
   - Verify logo/avatar
   - Test action rail buttons
   - Check footer sticky on mobile

5. **View Toggle:**
   - Switch to List view
   - Refresh → mode persists
   - Switch back to Grid

6. **Action Rail:**
   - Click "Home" → scrolls to top
   - Click "Promotions" → scrolls to featured + toast
   - Click "Menu" → scrolls to menu
   - Click "Share" → copies link
   - Click "Link" → copies link

## Output

**Files Changed:**
- `src/utils/prng.ts` (NEW)
- `src/lib/preview/previewLayout.ts` (REWRITTEN)
- `src/types/preview.ts` (UPDATED)
- `src/components/preview/StorePreviewGrid.tsx` (REWRITTEN)
- `src/components/preview/StorePreviewActionRail.tsx` (UPDATED)
- `src/pages/public/StorePreviewPage.tsx` (UPDATED)

**Layout Algorithm:**
- Content normalization → Priority scoring → Kind assignment → Size selection → Constraints → Dense packing
- Deterministic via seeded PRNG
- Ready for AI extension via layout policy interface

**TODOs:**
- Optional: Add actual image dimension detection
- Optional: Add lightbox for media tiles
- Optional: Implement favorites functionality
- Optional: Enable AI layout suggestions (when feature flag set)

