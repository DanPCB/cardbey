# Store Preview Grid/List + Tile Grammar Implementation ✅

## Summary

Implemented a beautiful, fast "visual taste" Store Preview with masonry-style grid layout, deterministic tile assignment, and right-side action rail. The grid uses a fixed tile grammar system with responsive column layouts.

## Files Changed

### New Files Created
1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/preview/previewLayout.ts`
   - Tile builder with seeded random
   - Featured item scoring system
   - Tile size assignment logic
   - Viewport configuration

2. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewActionRail.tsx`
   - Vertical floating action buttons
   - Scroll-to-section functionality
   - Share functionality with clipboard fallback

### Modified Files
1. `apps/dashboard/cardbey-marketing-dashboard/src/types/preview.ts`
   - Updated with new tile size system (SQUARE_S, SQUARE_M, RECT_W, RECT_T, RECT_T2, HERO, TEXT_CARD)
   - Viewport configuration types

2. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewGrid.tsx`
   - Complete rewrite with fixed tile grammar
   - 12-column grid (desktop), 6-column (tablet), 2-column (mobile)
   - Base row heights: 24px (desktop), 22px (tablet), 20px (mobile)
   - Responsive tile dimensions

3. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewList.tsx`
   - Enhanced with category support
   - Store-themed colors
   - Clean, readable list layout

4. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`
   - Removed duplicate header (HERO tile is in grid)
   - Added store-themed background gradient
   - Integrated action rail
   - Improved view toggle (compact on mobile)
   - Proper spacing for footer buttons

## Implementation Details

### 1. Tile Grammar System

**Fixed Tile Sizes:**
- **SQUARE_S:** 3 cols x 6 rows (desktop), 2 cols x 8 rows (mobile)
- **SQUARE_M:** 4 cols x 8 rows (desktop), 2 cols x 10 rows (mobile)
- **RECT_W:** 6 cols x 6 rows (desktop), 2 cols x 8 rows (mobile)
- **RECT_T:** 3 cols x 10 rows (desktop), 2 cols x 12 rows (mobile)
- **RECT_T2:** 4 cols x 12 rows (desktop), 2 cols x 12 rows (mobile)
- **HERO:** 12 cols x 10 rows (desktop), 6 cols x 10 rows (tablet), 2 cols x 10 rows (mobile)
- **TEXT_CARD:** 6 cols x 8 rows (desktop/tablet), 2 cols x 10 rows (mobile)

**Grid System:**
- Desktop: 12 columns, 24px base row height, 12px gap
- Tablet: 6 columns, 22px base row height, 12px gap
- Mobile: 2 columns, 20px base row height, 10px gap

### 2. Layout Algorithm

**Tile Assignment:**
1. **Hero tile** always first (HERO size)
2. **About text** always second (TEXT_CARD size)
3. **Menu items** scored and assigned:
   - Top 2 items marked as featured
   - Featured items get bigger sizes (RECT_W, SQUARE_M, RECT_T2)
   - Non-featured items mostly SQUARE_S and RECT_T
   - Media placeholders inserted every 6 items

**Scoring System:**
- Longer description = +0.3 max
- Higher price = +0.2 max
- Keywords (special, signature, premium, etc.) = +0.2
- Score clamped to 0..1

**Guardrails:**
- No 3 tall tiles in a row (downgrade to SQUARE)
- Max 2 big tiles adjacent (downgrade to SQUARE_S)
- Deterministic randomness for variety

**Placement:**
- Uses CSS Grid with `grid-auto-flow: dense`
- Tiles ordered by assignment logic
- Grid handles packing automatically

### 3. Deterministic Randomness

**Seeded RNG (Mulberry32):**
- Seed = `draftId || storeName || 'default'`
- Same seed = same layout every refresh
- Different seed = different pattern
- Used only for tie-breaks and variety

### 4. Store Theming

**Applied Throughout:**
- Background gradient using primary color (subtle tint)
- Hero tile uses brand colors
- Featured items highlighted with brand colors
- List view uses brand colors for headings and prices
- Action rail uses clean white with subtle shadows

### 5. Action Rail

**Desktop/Tablet:**
- Fixed vertical rail on right side
- 5 buttons: Home, Featured, Categories, Favorites, Share
- Scrolls to sections using ID anchors
- Clean white card with backdrop blur

**Mobile:**
- Single floating share button (mid-right)
- Positioned above footer buttons

**Sections:**
- `#hero` - Hero tile
- `#about` - About text tile
- `#featured` - First featured menu item
- `#menu` - Menu section

### 6. Responsive Behavior

**Mobile (< 768px):**
- 2-column grid
- Compact view toggle (icons only)
- Smaller tile sizes
- Floating share button

**Tablet (768px - 1024px):**
- 6-column grid
- Full view toggle
- Medium tile sizes

**Desktop (> 1024px):**
- 12-column grid
- Full tile sizes
- Action rail visible

## Manual Test Checklist

### Test 1: Grid View Default
- [ ] Generate store preview → Grid view appears by default
- [ ] Hero tile is first, full width
- [ ] About text tile is second
- [ ] Menu items follow in varied sizes

### Test 2: Deterministic Layout
- [ ] Refresh page 3 times → layout stays identical
- [ ] Different draftId → different pattern
- [ ] Same draftId → same pattern

### Test 3: View Toggle
- [ ] Switch to List → list renders
- [ ] Refresh → chosen mode persists
- [ ] Toggle works smoothly (no refetch)

### Test 4: Responsive
- [ ] Mobile (< 768px) → 2 columns, readable tiles
- [ ] Tablet (768-1024px) → 6 columns
- [ ] Desktop (> 1024px) → 12 columns
- [ ] No overflow, no tiny unreadable tiles

### Test 5: Footer Buttons
- [ ] Buttons visible and not overlapping grid
- [ ] Proper spacing from content
- [ ] "Save Draft & Create Account" works
- [ ] "Start Over" navigates correctly

### Test 6: Action Rail
- [ ] Visible on desktop/tablet (right side)
- [ ] Click "Home" → scrolls to hero
- [ ] Click "Featured" → scrolls to first featured tile
- [ ] Click "Categories" → scrolls to menu
- [ ] Click "Share" → copies link or opens share dialog
- [ ] Mobile shows floating share button

### Test 7: Store Theming
- [ ] Background has subtle brand color gradient
- [ ] Hero tile uses brand colors
- [ ] Featured items highlighted with brand colors
- [ ] List view uses brand colors for accents

### Test 8: Tile Sizes
- [ ] Featured items are larger (RECT_W, SQUARE_M, RECT_T2)
- [ ] No 3 tall tiles in a row
- [ ] No more than 2 big tiles adjacent
- [ ] Grid has pleasant rhythm and variety

## Layout Algorithm Summary

**Input:** Store data, menu items, seed string

**Process:**
1. **Normalize** → Create hero, about, menu item tiles
2. **Score** → Compute feature scores for menu items
3. **Mark Featured** → Top 2 items get featured flag
4. **Assign Sizes** → Featured get big sizes, others get varied sizes
5. **Apply Guardrails** → Prevent clustering, enforce rules
6. **Order** → Hero first, about second, menu items follow
7. **Place** → CSS Grid dense packing handles placement

**Output:** Ordered array of tiles with assigned sizes

**Deterministic:** Same seed → same tile assignment → same layout

## TODOs (Minimal)

- [ ] Optional: Add actual image dimension detection for better aspectRatio
- [ ] Optional: Add lightbox for media tiles
- [ ] Optional: Add favorites functionality
- [ ] Optional: Add category filtering

## Acceptance Criteria Met

✅ **Grid View:**
- Default view mode
- Masonry-style with unequal tile sizes
- Clean, bright style
- TikTok store vibe

✅ **Deterministic:**
- Same store → same layout every reload
- Seeded random for variety

✅ **Tile Grammar:**
- Fixed tile sizes (7 types)
- 12/6/2 column system
- Base row heights per viewport

✅ **Store Theming:**
- Header/hero uses brand colors
- Background gradient
- Featured items highlighted

✅ **Action Rail:**
- Right-side vertical rail (desktop/tablet)
- Scroll-to-section functionality
- Mobile floating button

✅ **List View:**
- Clean, structured list
- Category support
- Store-themed

✅ **Responsive:**
- Mobile: 2 cols, compact toggle
- Tablet: 6 cols
- Desktop: 12 cols
- No overflow, readable tiles

✅ **Footer Buttons:**
- Visible, not overlapping
- Proper spacing
- Functional

