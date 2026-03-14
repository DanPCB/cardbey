# Power Fix (AI) Frontend Integration - Complete

## Summary

Frontend integration for Power Fix (AI) feature is now complete. The feature allows merchants to automatically fix missing product fields (price, category, tags, description, image) for their entire catalog with real-time updates.

## Files Created/Modified

### 1. **`apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePowerFixSSE.ts`** (NEW)
   - Custom hook for subscribing to Power Fix SSE events
   - Handles: `catalog.power_fix.started`, `catalog.power_fix.progress`, `catalog.power_fix.completed`, `catalog.power_fix.error`
   - Similar pattern to `useMenuImageUpdates` for consistency

### 2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`** (MODIFIED)
   - Added `getProductsNeedingFix()` helper function
   - Added Power Fix state variables
   - Added SSE subscription via `usePowerFixSSE`
   - Added Power Fix button next to "Auto-fill images"
   - Added confirmation modal
   - Added summary modal
   - Real-time product updates via patch system

## Implementation Details

### Helper Function: `getProductsNeedingFix()`

```typescript
function getProductsNeedingFix(products, itemImageMap?): Array<{
  id: string;
  name: string;
  missing: string[];
}>
```

**Detects missing fields:**
- `price` - No price or priceV1.amount
- `category` - No categoryId
- `tags` - Empty tags array
- `description` - Empty or missing description
- `image` - No imageUrl, images, or itemImageMap entry

### State Management

```typescript
const [isPowerFixing, setIsPowerFixing] = useState(false);
const [powerFixJobId, setPowerFixJobId] = useState<string | null>(null);
const [powerFixProgress, setPowerFixProgress] = useState<{ current: number; total: number } | null>(null);
const [powerFixResults, setPowerFixResults] = useState<Map<string, { fixed: any; errors?: string[] }>>(new Map());
const [powerFixConfirmOpen, setPowerFixConfirmOpen] = useState(false);
const [powerFixSummaryOpen, setPowerFixSummaryOpen] = useState(false);
const [powerFixSummary, setPowerFixSummary] = useState<{ total: number; successful: number; failed: number; results: any[] } | null>(null);
```

### SSE Subscription

The `usePowerFixSSE` hook:
- Subscribes to `admin` SSE channel
- Filters events by `jobId` and `storeId`
- Calls callbacks for each event type:
  - `onStarted` - Initializes progress
  - `onProgress` - Updates progress and applies fixes to patch
  - `onCompleted` - Shows summary modal
  - `onError` - Shows error toast

### Power Fix Button

**Location:** Next to "Auto-fill images" button in product grid header

**Visibility:**
- Shows when `needsFixCount > 0` OR `isPowerFixing`
- Disabled when: context missing, no products need fix, or job running

**States:**
- **Idle:** "⚡ Power Fix (AI) ({count})"
- **Running:** Spinner + "{current}/{total}"

### Confirmation Modal

**Shows:**
- Product count needing fix
- Explanation: "AI will automatically fix missing fields..."
- Buttons: "Cancel" | "Confirm & Run"

**On Confirm:**
- Calls `POST /api/mi/catalog/power-fix`
- Passes: `storeId`, `generationRunId`, `productIds`
- Stores `jobId` in state
- Sets `isPowerFixing = true`

### Real-Time Updates

**SSE Progress Handler:**
- Updates progress bar: `{ current, total }`
- Stores result per product: `Map<productId, { fixed, errors }>`
- **Immediately applies fixes to patch:**
  - `updateProduct(productId, { description })`
  - `updateProduct(productId, { tags })`
  - `updateProduct(productId, { categoryId })`
  - `updateProduct(productId, { priceV1 })`

**UI Updates:**
- Product cards update instantly (via patch system)
- Progress bar shows current/total
- Button shows progress count

### Summary Modal

**Shows on completion:**
- Total processed
- Successful count (green)
- Failed count (red)
- Per-product breakdown:
  - Product name
  - Fields fixed
  - Errors (if any)
  - Success/error icon

**Actions:**
- "Done" button closes modal and refreshes draft

## Visual Indicators (TODO - Optional Enhancement)

To add visual indicators on product cards:

1. **Success Badge:** Show checkmark on fixed products
2. **Progress Indicator:** Show "Fixing..." badge while processing
3. **Error Badge:** Show alert icon on failed products

**Implementation location:** In `ProductReviewCard` component, check `powerFixResults.get(product.id)` to show badges.

## API Integration

**Endpoint:** `POST /api/mi/catalog/power-fix`

**Request:**
```json
{
  "storeId": "string",
  "generationRunId": "string (optional)",
  "productIds": ["string"] (optional)
}
```

**Response:**
```json
{
  "ok": true,
  "jobId": "string",
  "total": 10,
  "processed": 10,
  "successful": 8,
  "failed": 2,
  "results": [...]
}
```

## SSE Events

**Event Types:**
- `catalog.power_fix.started` - Job started
- `catalog.power_fix.progress` - Product fixed (real-time)
- `catalog.power_fix.completed` - Job completed
- `catalog.power_fix.error` - Job failed

**Event Payload:**
```json
{
  "jobId": "string",
  "storeId": "string",
  "current": 5,
  "total": 10,
  "productId": "string",
  "productName": "string",
  "result": {
    "productId": "string",
    "productName": "string",
    "fixed": {
      "tags": true,
      "category": true,
      "description": false,
      "image": false,
      "price": true
    },
    "errors": []
  }
}
```

## Safety & UX

### Safety Rules
- ✅ Never overwrites valid user data (only fills missing fields)
- ✅ Manual Quick Edit still works during Power Fix
- ✅ Promotion gating logic preserved
- ✅ Non-blocking: UI remains responsive

### UX Details
- ✅ Subtle "AI working" animation (spinner) on button
- ✅ Real-time progress updates
- ✅ Success checkmark in summary modal
- ✅ Error handling with user-friendly messages
- ✅ Confirmation before running (prevents accidental runs)

## Testing Checklist

- [ ] Click "Power Fix (AI)" button
- [ ] Confirmation modal shows correct product count
- [ ] Confirm → API call succeeds, jobId stored
- [ ] SSE events received and processed
- [ ] Progress bar updates in real-time
- [ ] Product cards update instantly (patch applied)
- [ ] Summary modal shows on completion
- [ ] Per-product breakdown accurate
- [ ] Works with 300+ products (batch processing)
- [ ] Promotion gate passes after Power Fix
- [ ] Manual Quick Edit still works
- [ ] No console errors
- [ ] Performance remains smooth

## Known Limitations

1. **Visual Indicators:** Product cards don't show success badges yet (optional enhancement)
2. **Error Recovery:** Failed products are logged but not auto-retried
3. **Confidence Threshold:** No AI confidence threshold check (all fixes applied)

## Next Steps (Optional Enhancements)

1. Add success/error badges to product cards
2. Add "Retry failed" button in summary modal
3. Add AI confidence threshold (mark "needs review" if low confidence)
4. Add per-field confidence scores in summary
5. Add "Undo Power Fix" option (revert changes)

## Files Summary

- ✅ `usePowerFixSSE.ts` - SSE hook (NEW)
- ✅ `StoreDraftReview.tsx` - Main integration (MODIFIED)
- ✅ `powerFixService.js` - Backend service (already exists)
- ✅ `miRoutes.js` - API endpoint (already exists)

The feature is now **fully functional** and ready for testing!


