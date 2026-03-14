# Match Score Badge Implementation

## Overview
Implemented clean match score badge feature for image suggestions with deterministic scoring, color coding, and tooltip.

## Requirements Met

✅ **Score in 0-1 format**: Backend returns `score` (0-1) and `scorePercent` (0-100)  
✅ **UI renders percentage**: Frontend displays `Math.round(score * 100)%`  
✅ **Color bands**:
   - `>= 0.75` (75%+) = **green** (`bg-green-100 text-green-800 border-green-300`)
   - `0.55 - 0.74` (55-74%) = **orange** (`bg-orange-100 text-orange-800 border-orange-300`)
   - `< 0.55` (<55%) = **red** (`bg-red-100 text-red-800 border-red-300`)
✅ **Deterministic scoring**: Score is stable between refreshes (no randomness in scoring algorithm)  
✅ **Tooltip**: "Match score based on product + store theme keywords."

## Implementation Details

### Backend (`apps/core/cardbey-core/src/routes/menuImagesRoutes.js`)

**Response Structure:**
```javascript
{
  score: 0.82,           // Score in 0-1 format (deterministic)
  scorePercent: 75,     // Bucketed percentage (100, 75, 60, 50, 40)
  reasons: [...],        // Scoring reasons
}
```

**Scoring Algorithm** (`apps/core/cardbey-core/src/mi/contentBrain/imageScoring.ts`):
- **Deterministic**: No randomness, purely based on text matching
- **Factors**:
  - Product name matches (high weight: +0.25)
  - Product keyword matches (+0.15)
  - Store keyword matches (+0.1)
  - Category matches (+0.1)
  - Store type matches (+0.1)
  - Mismatch penalties (-0.4 for avoidKeywords)
- **Score clamping**: `Math.max(0, Math.min(1, baseScore))`
- **Bucketing**: Raw score → percentage buckets (100%, 75%, 60%, 50%, 40%)

### Frontend (`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`)

**Badge Component:**
```tsx
{candidate.score !== undefined && (() => {
  // Score is in 0-1 format, convert to percentage
  const scorePercent = Math.round(candidate.score * 100);
  // Color bands: >=0.75 = green, 0.55-0.74 = orange, <0.55 = red
  const scoreValue = candidate.score; // Use 0-1 value for color determination
  const colorClass =
    scoreValue >= 0.75
      ? 'bg-green-100 text-green-800 border-green-300'
      : scoreValue >= 0.55
      ? 'bg-orange-100 text-orange-800 border-orange-300'
      : 'bg-red-100 text-red-800 border-red-300';
  
  return (
    <div
      className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full border shadow-sm cursor-help ${colorClass}`}
      title="Match score based on product + store theme keywords."
    >
      {scorePercent}%
    </div>
  );
})()}
```

**Features:**
- Positioned top-left corner of image
- Rounded badge with border and shadow
- Color-coded based on score thresholds
- Native HTML `title` tooltip (works on hover/tap)
- `cursor-help` for better UX

## Files Changed

1. **`apps/core/cardbey-core/src/routes/menuImagesRoutes.js`**
   - Updated to return both `score` (0-1) and `scorePercent` (0-100)
   - Removed `scoreLabel` (redundant)

2. **`apps/dashboard/cardbey-marketing-dashboard/src/api/menuImages.ts`**
   - Updated `ImageCandidate` interface to include both `score` (0-1) and `scorePercent` (0-100)

3. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`**
   - Updated badge to use `score` (0-1) for color determination
   - Convert to percentage: `Math.round(candidate.score * 100)`
   - Color coding: >=0.75 green, 0.55-0.74 orange, <0.55 red
   - Added tooltip: "Match score based on product + store theme keywords."
   - Fixed logging to use correct score format

## Deterministic Scoring

The scoring algorithm is **fully deterministic**:
- No random number generation
- No time-based factors
- Purely based on:
  - Text matching (product name, keywords, category)
  - Store intent (cuisine, store type, keywords)
  - Mismatch detection (avoidKeywords)
- Same input → same score (stable between refreshes)

## Color Coding Logic

```typescript
const scoreValue = candidate.score; // 0-1 format
const colorClass =
  scoreValue >= 0.75   // 75%+ → Green (high confidence)
    ? 'bg-green-100 text-green-800 border-green-300'
  : scoreValue >= 0.55 // 55-74% → Orange (medium confidence)
    ? 'bg-orange-100 text-orange-800 border-orange-300'
  :                    // <55% → Red (low confidence)
    'bg-red-100 text-red-800 border-red-300';
```

## Testing

**Manual Test:**
1. Open product edit drawer
2. Click "Suggest images"
3. Verify:
   - Badge appears on each image (top-left)
   - Percentage displayed (e.g., "75%")
   - Color matches score:
     - 75%+ = green
     - 55-74% = orange
     - <55% = red
   - Tooltip appears on hover: "Match score based on product + store theme keywords."
   - Same product → same scores on refresh (deterministic)

## Future Enhancements

- Consider using a proper tooltip component (Radix UI) for better mobile support
- Add score breakdown in tooltip (show reasons on hover)
- Add animation for score changes
- Consider accessibility improvements (ARIA labels)




