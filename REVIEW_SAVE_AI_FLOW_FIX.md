# Review → Save → AI Flow Finalization

## Problem

AI features (Auto-fill images, Add product) were failing with "Item not found" errors because they were operating on draft items with `prod_*` IDs instead of persisted database items.

## Solution

Implemented a flow that:
1. Detects draft items (`prod_*` IDs)
2. Disables AI features when draft items exist
3. Shows persistent banner prompting user to save
4. Makes Save button primary CTA when draft items exist
5. After save, enables AI features (items are now persisted)

## Changes Made

### 1. Draft Detection

**Location:** `StoreDraftReview.tsx` (line ~175)

```typescript
// Detect if we have draft items (prod_* IDs) - AI features require persisted items
const hasDraftItems = useMemo(() => {
  return effectiveDraft.catalog.products.some(p => p.id?.startsWith('prod_'));
}, [effectiveDraft.catalog.products]);

// Get canonical context for AI feature guards
const ctx = useMemo(() => getCanonicalContext(), []);
const hasValidContextForAI = !!(ctx.storeId && ctx.tenantId);
```

### 2. Disable AI Features When Draft Items Exist

**Auto-fill Images Button:**
- Disabled when `hasDraftItems === true` or `!hasValidContextForAI`
- Shows warning toast if clicked while disabled
- Tooltip explains why it's disabled

**Add Product Buttons (3 locations):**
- All "Add product" buttons disabled when `hasDraftItems === true`
- Shows warning toast if clicked while disabled
- Tooltip explains why it's disabled

### 3. Persistent Banner

**Location:** `StoreDraftReview.tsx` (line ~1258)

```typescript
{hasDraftItems && (
  <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
    <AlertCircle className="w-4 h-4" />
    <span>Save your menu first to enable AI features.</span>
  </div>
)}
```

### 4. Make Save Primary CTA

**Location:** `StoreDraftReview.tsx` (line ~1260)

- When `hasDraftItems === true`:
  - Save button uses primary styling (violet-600 background, white text)
  - Button is enabled even if `!isDirty` (allows saving draft items)
  - Button text changes to "Save Menu" (more prominent)

### 5. Post-Save Handling

**Location:** `StoreDraftReview.tsx` (line ~410)

After successful save:
- Fetches DB products to get real IDs
- Creates mapping from product name to DB ID
- Logs mapping results (debug mode only)
- Note: Actual state refresh happens on next render when backend returns updated data

### 6. Context Guards

All AI actions check:
- `hasDraftItems` → block with "Save your menu first" message
- `!hasValidContextForAI` → block with "Finish creating your store first" + show `FinishSetupModal`

## Files Changed

### `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
1. Added `AlertCircle` icon import
2. Added `hasDraftItems` computed value (detects `prod_*` IDs)
3. Added `hasValidContextForAI` computed value (checks `storeId` and `tenantId`)
4. Updated `handleSave` to fetch DB products after save
5. Updated Auto-fill Images button:
   - Added `isDisabled` check
   - Added guard checks in `onClick`
   - Added disabled styling
   - Added tooltip
6. Updated all 3 "Add product" buttons:
   - Added `disabled={hasDraftItems}`
   - Added guard checks in `onClick`
   - Added disabled styling
   - Added tooltip
7. Added persistent banner when `hasDraftItems === true`
8. Updated Save button:
   - Primary styling when `hasDraftItems === true`
   - Enabled when `hasDraftItems === true` even if `!isDirty`
   - Changed text to "Save Menu" when draft items exist

## User Flow

### Before Save (Draft Items Exist)

1. User sees persistent banner: "Save your menu first to enable AI features."
2. Auto-fill Images button is disabled (grayed out)
3. All "Add product" buttons are disabled (grayed out)
4. Save button is primary CTA (violet, always enabled)

### After Save (Items Persisted)

1. Banner disappears
2. Auto-fill Images button is enabled
3. All "Add product" buttons are enabled
4. Save button returns to normal styling (only enabled when `isDirty`)

## Acceptance Criteria

✅ **Draft Detection:**
- Detects `prod_*` IDs in products
- Computes `hasDraftItems` correctly

✅ **AI Features Disabled:**
- Auto-fill Images button disabled when draft items exist
- All "Add product" buttons disabled when draft items exist
- Shows warning toast if user tries to use disabled features

✅ **Persistent Banner:**
- Shows when `hasDraftItems === true`
- Clear message: "Save your menu first to enable AI features."
- Uses amber styling (warning)

✅ **Save as Primary CTA:**
- Save button uses primary styling when draft items exist
- Save button enabled even if `!isDirty` when draft items exist
- Button text changes to "Save Menu"

✅ **Post-Save:**
- After save, attempts to fetch DB products
- Logs mapping results (debug mode)
- State refreshes on next render

✅ **Context Guards:**
- Blocks AI actions if `!storeId || !tenantId`
- Shows `FinishSetupModal` if context missing
- Clear error messages

## Testing Checklist

1. **Test Draft Detection:**
   - Create store with draft items (`prod_*` IDs)
   - ✅ Banner appears
   - ✅ AI features disabled

2. **Test Save Flow:**
   - Click "Save Menu" button
   - ✅ Save succeeds
   - ✅ Banner disappears
   - ✅ AI features enabled

3. **Test Disabled Features:**
   - Try clicking disabled "Auto-fill Images"
   - ✅ Shows warning toast
   - ✅ No API call made

4. **Test Context Guards:**
   - Clear `localStorage.cardbey.ctx.*`
   - Try using AI features
   - ✅ Shows error toast
   - ✅ Shows `FinishSetupModal`

5. **Test Post-Save:**
   - Save draft items
   - Check console (debug mode)
   - ✅ Logs DB product mapping
   - ✅ Future AI operations work




