# Creative Engine Content Selection + MI Panel Wiring

## Overview

Wired content selection to the MI Brain panel in `/app/creative-shell`. When users select a Content from the library, the MI panel displays that content's MIEntity data.

## Implementation Summary

### 1. Content List Component

**Component Used:** `DesignLibrary` from `features/contents-studio/components/DesignLibrary.tsx`

- Reused existing DesignLibrary component
- Enhanced to support external data source (contents passed as props)
- Added selection support with visual indicators
- Added MI badge display on content cards

### 2. Selection State Management

**File:** `src/pages/CreativeEngineShellPage.tsx`

**State Added:**
```typescript
type ContentWithMI = DesignListItem & {
  miEntity?: any | null;
};
const [selectedContent, setSelectedContent] = useState<ContentWithMI | null>(null);
const [contents, setContents] = useState<ContentWithMI[]>([]);
const [contentsLoading, setContentsLoading] = useState(false);
```

**Data Loading:**
- Fetches contents on page mount via `listDesigns()` from `/api/contents`
- API response includes `miEntity` field for each content
- Contents stored in state and passed to DesignLibrary as props

### 3. Selection Handling

**Click Handler:**
- When a content card is clicked, `onSelectDesign` callback is triggered
- Updates `selectedContent` state with the clicked design
- DesignLibrary receives `selectedDesignId` prop to highlight selected card

**Visual Selection Indicator:**
- Selected card has:
  - `border-primary` (primary color border)
  - `bg-primary/5` (subtle primary background)
  - `shadow-md` (enhanced shadow)

### 4. MI Panel Binding

**File:** `src/pages/CreativeEngineShellPage.tsx`

```tsx
<MIInspectorPanel entity={selectedContent?.miEntity ?? null} />
```

- Panel receives `selectedContent.miEntity` when content is selected
- Shows "No MI Brain attached" when no content selected or content has no MIEntity
- Gracefully handles missing miEntity (null-safe)

### 5. MI Badge on Content Cards

**Component:** `MIBadge` from `components/MIBadge.tsx`

**Location:** Top-right corner of each content card thumbnail

**Behavior:**
- Only displays if `design.miEntity` exists
- Shows emerald-themed badge with Brain icon and "MI" text
- Non-invasive, positioned alongside "View" button
- Reuses existing MIBadge component from Signage

## Files Modified

### Frontend

1. **`src/pages/CreativeEngineShellPage.tsx`**
   - Added content fetching (`loadContents()`)
   - Added selection state (`selectedContent`)
   - Replaced AI Image Generation Card with DesignLibrary
   - Wired `selectedContent.miEntity` to MIInspectorPanel

2. **`src/features/contents-studio/components/DesignLibrary.tsx`**
   - Added `onSelectDesign` prop
   - Added `selectedDesignId` prop
   - Added `designs` and `loading` props (for external control)
   - Added visual selection indicator (border/background)
   - Added MI badge to content cards
   - Updated click handler to trigger selection

3. **`src/features/contents-studio/api/contents.ts`**
   - Added `MIEntity` type definition
   - Updated `DesignListItem` to include `miEntity?: MIEntity | null`
   - Updated `listDesigns()` to preserve `miEntity` from API response

## Data Flow

1. **Page Load:**
   ```
   CreativeEngineShellPage mounts
   → loadContents() called
   → listDesigns() fetches from /api/contents
   → API returns contents with miEntity attached
   → contents state updated
   → DesignLibrary receives contents as props
   ```

2. **Content Selection:**
   ```
   User clicks content card
   → onSelectDesign(design) called
   → setSelectedContent(design) updates state
   → DesignLibrary receives selectedDesignId prop
   → Card shows selection indicator
   → MIInspectorPanel receives selectedContent.miEntity
   → Panel displays MI data
   ```

3. **MI Badge Display:**
   ```
   DesignLibrary renders content cards
   → Checks if design.miEntity exists
   → Renders MIBadge if present
   → Badge shows on card thumbnail
   ```

## Type Safety

- `ContentWithMI` type extends `DesignListItem` with `miEntity` field
- `MIEntity` type matches backend structure
- All null checks in place (`selectedContent?.miEntity ?? null`)
- TypeScript types ensure type safety throughout

## Visual Design

### Selection Indicator
- Primary border color when selected
- Subtle primary background tint
- Enhanced shadow for depth
- Smooth transitions

### MI Badge
- Emerald color scheme (matches Signage badges)
- Small, unobtrusive size
- Positioned top-right of thumbnail
- Only visible when MIEntity exists

## Testing Checklist

- [ ] Page loads and fetches contents
- [ ] Contents display in grid layout
- [ ] Clicking a content card selects it (visual indicator appears)
- [ ] MI panel shows MI data when content is selected
- [ ] MI panel shows "No MI Brain attached" when no selection
- [ ] MI badges appear on cards with MIEntity
- [ ] MI badges don't appear on cards without MIEntity
- [ ] Selection persists until another card is clicked
- [ ] No errors in console

## Follow-up Enhancements

1. **Keyboard Navigation** - Arrow keys to navigate content list
2. **Search Integration** - Filter contents by name/search
3. **Bulk Selection** - Select multiple contents (if needed)
4. **MI Panel Actions** - Add actions like "Export to Signage" from MI panel
5. **Content Preview** - Show larger preview on selection

## Related Documentation

- **[MI_PROCESS_FLOW.md](../docs/MI_PROCESS_FLOW.md)** - Complete MI process flows
- **[CREATIVE_ENGINE_MI_WIRING.md](../docs/CREATIVE_ENGINE_MI_WIRING.md)** - Backend MI wiring for Creative Engine
- **[FILTER_STUDIO_EXPORT_FIX.md](../docs/FILTER_STUDIO_EXPORT_FIX.md)** - FilterStudio export flow
