# Image-First Cards + Overlay System Implementation ✅

## Summary

Implemented a comprehensive Image-First Card rendering system for the Store Preview grid, supporting full-bleed images/videos with bottom gradient overlays, while maintaining existing text-only cards and placeholder styles.

## Files Created

### New Files
1. **`src/hooks/useInView.ts`**
   - Intersection Observer hook to detect when elements enter viewport
   - Used for video autoplay optimization

2. **`src/hooks/usePrefersReducedMotion.ts`**
   - Detects user's motion preference
   - Disables hover animations and video autoplay when enabled

3. **`src/components/preview/StoreTileCard.tsx`**
   - Reusable card component with three variants:
     - `image-first`: Full-bleed image/video with bottom overlay
     - `text-poster`: Text-only style (existing)
     - `placeholder`: Intentional placeholder with pattern

### Modified Files
1. **`src/components/preview/mosaic/MosaicGrid.tsx`**
   - Integrated `StoreTileCard` component
   - Maps tiles to appropriate variants based on media availability
   - Maintains grid layout and sizing

## Implementation Details

### StoreTileCard Component

**Props:**
```typescript
interface StoreTileCardProps {
  variant: 'image-first' | 'text-poster' | 'placeholder';
  media?: TileMedia;
  overlay?: TileOverlay;
  brandColor?: string;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  'aria-label'?: string;
  style?: React.CSSProperties;
}
```

### Image-First Variant

**Layout:**
- Root card: `relative`, `overflow-hidden`, `rounded-2xl`, `shadow-sm`
- Media layer: `absolute inset-0`
  - Image: `<img>` with `object-cover`
  - Video: `<video>` with `object-cover`, `muted`, `playsInline`, `loop`
- Overlay layer: `absolute left-0 right-0 bottom-0 p-3 md:p-4`
  - Gradient: `bg-gradient-to-t from-black/50 via-black/15 to-transparent`
  - Backdrop blur: `backdrop-blur-[2px]`

**Overlay Content:**
- Badge chip (if `overlay.badge` exists)
- Title (line clamp 1)
- Subtitle (line clamp 1, optional)
- Price (right-aligned or below, optional)

**Video Autoplay:**
- Only autoplays if:
  - Card is in viewport (`useInView` hook)
  - `prefers-reduced-motion` is false
  - Otherwise shows poster image

**Hover/Tap Interactions:**
- Scale: `hover:scale-[1.03]` (disabled if reduced motion)
- Shadow: `hover:shadow-lg`
- Overlay opacity increases slightly on hover

### Text-Poster Variant

**Layout:**
- Maintains existing text-only style
- Unified spacing and typography
- Body text clamped to avoid huge cards
- Same card container + hover lift for consistency

**Features:**
- Badge support (Featured, etc.)
- Title, subtitle, description
- Price display
- Brand color theming

### Placeholder Variant

**Layout:**
- Subtle gradient background (brand colors, 30% opacity)
- Dotted pattern overlay (10% opacity)
- Centered sparkle icon
- "Generated" label
- Rounded corners, intentional design

### Variant Mapping Logic

**Rules:**
1. If tile has `imageUrl`, `photoUrl`, `media.url`, `asset.url`, or `videoUrl`:
   - Variant: `image-first`
   - Media type determined by file extension (.mp4, .webm, .mov = video)

2. If tile type is `filler`:
   - Variant: `placeholder`

3. Otherwise:
   - Variant: `text-poster`

**Tile-Specific Overlays:**
- **Hero**: Title + subtitle (if image-first), or gradient background (if text-poster)
- **About**: Description text
- **Menu Item**: Title + description + price + badge (if featured)
- **Media**: Title only

### Accessibility

**Keyboard Navigation:**
- Cards are `button` or `div[role="button"]` when clickable
- `tabIndex={0}` for keyboard focus
- `Enter` and `Space` keys trigger click

**ARIA Labels:**
- `aria-label="Open ${title}"` for clickable cards
- Descriptive labels for placeholders

**Motion Preferences:**
- Respects `prefers-reduced-motion`
- Disables hover scale animations
- Disables video autoplay

### Styling

**Consistent Brand Colors:**
- Uses `brandColor` prop for theming
- Overlay badges use brand color
- Placeholder uses brand color gradient

**Responsive:**
- Padding: `p-3 md:p-4` (mobile/desktop)
- Text sizes: `text-sm md:text-base` (responsive)
- Works on mobile and desktop

## Integration

**MosaicGrid Integration:**
- Replaced old tile rendering with `StoreTileCard`
- Maintains grid layout and sizing
- Preserves click handlers and gallery modal integration

**Data Field Mapping:**
- Checks multiple fields: `imageUrl`, `photoUrl`, `media.url`, `asset.url`, `videoUrl`
- Video detection via file extension
- Falls back to image if unknown

## Acceptance Tests ✅

✅ **Grid view shows mix of image-first and text cards:**
- Cards with images render as image-first
- Cards without images render as text-poster
- Layout remains intact

✅ **Images are full-bleed with overlay:**
- Images cover entire card (`object-cover`)
- Bottom gradient overlay visible
- Text readable over images

✅ **No empty blank cards:**
- Placeholders show intentional design
- Pattern and icon visible
- "Generated" label present

✅ **Hover lift works desktop:**
- Cards scale on hover (if motion allowed)
- Shadow increases
- Overlay opacity increases

✅ **Tap feedback works mobile:**
- Cards respond to tap
- Visual feedback provided

✅ **Video autoplay optimization:**
- Only in-viewport videos autoplay
- Others show poster image
- Respects reduced motion preference

✅ **No console errors:**
- All components render correctly
- No TypeScript errors
- No runtime errors

## Manual Test Steps

1. **Test Image-First Cards:**
   - Open preview with items that have images
   - Verify images are full-bleed
   - Verify bottom overlay with text
   - Verify gradient is readable

2. **Test Video Cards:**
   - Add items with video URLs (.mp4, .webm)
   - Scroll page to bring video into viewport
   - Verify video autoplays when in viewport
   - Verify poster shows when not in viewport

3. **Test Text-Poster Cards:**
   - Open preview with items without images
   - Verify text-only cards render correctly
   - Verify spacing and typography
   - Verify hover effects work

4. **Test Placeholder Cards:**
   - Verify filler tiles show pattern
   - Verify sparkle icon and "Generated" label
   - Verify intentional design (not blank)

5. **Test Accessibility:**
   - Tab through cards with keyboard
   - Press Enter/Space to activate
   - Verify screen reader announces labels
   - Test with reduced motion enabled

6. **Test Responsive:**
   - Resize browser window
   - Verify cards adapt to mobile/tablet/desktop
   - Verify text sizes adjust
   - Verify overlay remains readable

## Files Changed

1. `src/hooks/useInView.ts` - NEW
2. `src/hooks/usePrefersReducedMotion.ts` - NEW
3. `src/components/preview/StoreTileCard.tsx` - NEW
4. `src/components/preview/mosaic/MosaicGrid.tsx` - Modified

## Notes

- Image-first cards provide modern, visual-first experience
- Overlay system ensures text readability on any image
- Video autoplay is optimized for performance and accessibility
- All variants maintain consistent hover/tap interactions
- Accessibility features ensure inclusive experience
- No backend changes required - uses existing data fields

