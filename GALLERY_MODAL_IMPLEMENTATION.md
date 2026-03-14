# Scroll-Snap Tile Gallery Modal Implementation ✅

## Summary

Implemented a full-screen scroll-snap gallery modal (TikTok/Pexels style) that opens when clicking any tile in the Store Preview Grid. Features horizontal swipe navigation, keyboard controls, and smooth scroll-snap behavior.

## Files Changed

### New Files Created
1. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/GalleryModal.tsx`
   - Full-screen modal with scroll-snap horizontal gallery
   - Top bar: Close button, store name, index indicator
   - Bottom bar: "Back to preview" and "Save Draft & Create Account" buttons
   - Keyboard navigation (ESC, Arrow keys)
   - Desktop navigation arrows
   - Body scroll lock when open

2. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/GallerySlide.tsx`
   - Renders individual slides for different tile types
   - Hero: Gradient card with title/subtitle
   - About: Readable paragraph card
   - Menu: Large typography with price, featured badge
   - Media: Image cover or video placeholder
   - Filler: Gradient/pattern with label

### Modified Files
1. `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/StorePreviewGrid.tsx`
   - Made all tiles clickable (not just menu items)
   - Updated `onTileClick` to pass tile and index
   - All tile types now have click handlers

2. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`
   - Added gallery modal state management
   - Converts preview data to gallery items on tile click
   - Maps clicked tile to correct gallery index
   - Removed old TileModal (replaced by GalleryModal)

## Implementation Details

### Gallery Item Model
```typescript
type GalleryItem =
  | { id: string; kind: 'hero'; title: string; subtitle?: string; gradient?: string }
  | { id: string; kind: 'about'; text: string }
  | { id: string; kind: 'menu'; name: string; description?: string; price?: number; currency?: string; featured?: boolean }
  | { id: string; kind: 'media'; title?: string; url?: string; mediaType?: 'image'|'video' }
  | { id: string; kind: 'filler'; label?: string };
```

### Modal Behavior

**Layout:**
- Mobile: Full screen
- Desktop: Centered dialog (max-width 900px, 90vh height)
- Background: Dimmed overlay (`bg-black/60`) with backdrop blur

**Top Bar:**
- Left: Close button (X icon)
- Center: Store name (or "Preview")
- Right: Index indicator ("3 / 12")

**Bottom Bar:**
- Left: "Back to preview" button
- Right: "Save Draft & Create Account" button (primary)

**Scroll-Snap Gallery:**
- Container: `display: flex`, `overflow-x: auto`
- Scroll-snap: `scroll-snap-type: x mandatory`
- Each slide: `flex: 0 0 100%`, `scroll-snap-align: center`
- Full height minus header/bottom bars
- Hidden scrollbars (CSS + WebKit)

**Initial Scroll:**
- On open: Scrolls to `initialIndex` using `scrollTo({ left: index * width })`
- Instant scroll (no animation) for initial positioning

**Active Index Tracking:**
- Uses `onScroll` + `requestAnimationFrame` for debouncing
- Computes: `Math.round(scrollLeft / width)`
- Updates index indicator in real-time

### Touch/Trackpad Feel

**CSS:**
- `scrollbar-width: none` (Firefox)
- `::-webkit-scrollbar { display: none }` (WebKit)
- `-webkit-overflow-scrolling: touch` (iOS smooth scrolling)

**Body Scroll Lock:**
- Sets `document.body.style.overflow = 'hidden'` on open
- Restores original value on close
- Prevents background page scrolling

### Keyboard + Accessibility

**ESC Key:**
- Closes modal

**Arrow Keys:**
- Left Arrow: Navigate to previous slide
- Right Arrow: Navigate to next slide
- Prevents default browser behavior

**Focus:**
- Close button receives focus on open (implicit via button)

### Slide Rendering

**Hero Slide:**
- Big gradient card (uses store brand colors)
- Store name/title (large, bold)
- Subtitle (slogan/tagline)

**About Slide:**
- Readable paragraph card
- Centered text, max-width for readability

**Menu Slide:**
- Large typography (3xl-5xl)
- Featured badge if applicable
- Description (if available)
- Price (large, bold, brand color)

**Media Slide:**
- If image: Shows image cover (`object-contain`)
- If video: Placeholder with play icon
- If missing: Nice placeholder tile (not blank)

**Filler Slide:**
- Gradient background (store colors)
- Subtle pattern overlay
- "Generated" label

### Tile Click Mapping

**Index Calculation:**
- Hero tile → Gallery index 0
- AboutText tile → Gallery index 1
- MenuItem tile → Gallery index 2 + menuIndex
- Media tile → Gallery index 2 + items.length + mediaIndex
- Filler tile → Gallery index at end

## Acceptance Tests

✅ **Tap any tile → modal opens:**
- Clicking any tile (hero, about, menu, media, filler) opens gallery
- Modal lands on the clicked tile's slide

✅ **Swipe left/right → snaps one slide:**
- Horizontal swipe navigates between slides
- Scroll-snap ensures one slide at a time (no partial stops)
- Smooth scrolling behavior

✅ **Close → returns to preview:**
- Clicking X or "Back to preview" closes modal
- Returns to same scroll position in preview page
- Body scroll restored

✅ **Desktop arrows navigate:**
- Left/Right arrow buttons visible on desktop
- Clicking navigates to previous/next slide
- Arrows hide at first/last slide

✅ **ESC closes:**
- Pressing ESC key closes modal

✅ **No background scroll:**
- Body scroll locked when modal open
- Background page doesn't scroll while modal visible
- Scroll restored on close

## Manual Test Steps

1. **Open Gallery:**
   - Navigate to `/preview/:draftId`
   - Click any tile in grid view
   - Verify modal opens full-screen
   - Verify clicked tile's slide is shown

2. **Navigate Slides:**
   - Swipe left/right on mobile
   - Click arrow buttons on desktop
   - Use keyboard arrows
   - Verify scroll-snap works (one slide at a time)

3. **Close Modal:**
   - Click X button
   - Click "Back to preview"
   - Press ESC key
   - Verify modal closes and returns to grid

4. **Body Scroll Lock:**
   - Open modal
   - Try scrolling background page
   - Verify page doesn't scroll
   - Close modal
   - Verify page scrolling works again

5. **Index Indicator:**
   - Navigate through slides
   - Verify indicator updates (e.g., "3 / 12")
   - Verify it matches current slide

## Files Modified

1. `src/components/preview/GalleryModal.tsx` - NEW
2. `src/components/preview/GallerySlide.tsx` - NEW
3. `src/components/preview/StorePreviewGrid.tsx` - Made all tiles clickable
4. `src/pages/public/StorePreviewPage.tsx` - Added gallery modal integration

## Notes

- Gallery items are built from preview data on tile click (no backend changes)
- Media placeholders render nicely if URL is missing
- All tile types are clickable (hero, about, menu, media, filler)
- Scroll-snap ensures smooth, predictable navigation
- Works great on mobile with touch gestures

