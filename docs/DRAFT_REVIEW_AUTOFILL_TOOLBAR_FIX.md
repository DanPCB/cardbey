# Draft Review: Auto-fill missing images toolbar fix

## A) Root cause

- **Why the button was disabled**
  - The toolbar "Auto-fill missing images" button is disabled when `imageAutofillDay2Loading || missingCount === 0`. It does **not** use `hasValidContextForAI` or "setup complete".
  - So it appears disabled when: (1) there are no products missing images (`missingCount === 0`), or (2) draft not loaded (no `baseDraft.id` / `baseDraft.meta.draftId`), or (3) a run is in progress.
  - For temp stores, if the draft was still loading or products were counted as having images (e.g. from `itemImageMap` or backend), `missingCount` could be 0 and the button stayed disabled.

- **Why the "Finish setup to continue" modal appeared**
  - The modal is opened by `setFinishSetupOpen(true)` in several places. Two of those were in **image** flows:
    1. **Bulk image autofill** (handler `handleAutoFillImages` in the same block as ImproveDropdown): it guarded on `!hasValidContextForAI` and on `!effectiveStoreId || !effectiveTenantId`, then showed the modal. That handler is not passed to ImproveDropdown (the dropdown uses `handleDay2AutoFill`), but the same setup guard was still wrong for any image path.
    2. **Per-product image suggestion** (single-product "Add image" / magic wand): it required `effectiveStoreId` and `effectiveTenantId` and opened the Finish setup modal when missing. That made image suggestions look like they were "blocked by setup" like promotions.
  - Promotions and Power Fix correctly keep their own guards and still open the Finish setup modal when setup is incomplete.

## B) Minimal patch (file list)

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | 1) Bulk `handleAutoFillImages`: removed setup guard and `setFinishSetupOpen(true)`; now only toasts and returns when store/tenant not ready. 2) Per-product suggestImages guard: removed `setFinishSetupOpen(true)`; toast only when store/tenant not ready. 3) Toolbar "Auto-fill missing images" button: added `draftLoaded` so button is disabled when no draft; added explicit tooltips for disabled states ("No missing images", "Load draft first", "Auto-filling…"). |
| `apps/dashboard/cardbey-marketing-dashboard/tests/ImproveDropdownImageAutofill.test.tsx` | Two tests: (1) Clicking "Auto-fill missing images" invokes `onAutoFillImages` (does not open Finish setup). (2) "Auto-fill missing images" is enabled when `onAutoFillImages` is provided and `missingCount > 0`. |

No backend or store-creation pipeline changes. No PATCH/API contract changes.

## C) Tests and commands

**Run tests**
```bash
cd apps/dashboard/cardbey-marketing-dashboard
pnpm test tests/ImproveDropdownImageAutofill.test.tsx --run
```

**Coverage**
- ImproveDropdown: "Auto-fill missing images" visible when `showAutoFillImages` true, hidden when false.
- ImproveDropdown: menu item has expected tooltip.
- **New:** Clicking "Auto-fill missing images" calls `onAutoFillImages` once (modal not involved).
- **New:** "Auto-fill missing images" is enabled when `onAutoFillImages` is provided and `missingCount > 0`.

## D) Manual verification

1. **Enable image autofill**
   - In browser console: `localStorage.setItem('cardbey.imageAutofill','1'); location.reload();`

2. **Draft Review with temp store and missing images**
   - Open Draft Review for a temp store (e.g. Union Road Sweets) that has products with no images.
   - Confirm "Auto-fill missing images" is **enabled** (not dim).
   - Click "Auto-fill missing images": one PATCH + refetch should run; **no** "Finish setup to continue" modal.
   - If all products already have images: button should be disabled with tooltip "No missing images".

3. **Promotions still gated**
   - With setup incomplete, trigger a promotion action (e.g. Create promo / Smart promo / QR).
   - "Finish setup to continue" modal should still appear for promotions.

4. **Optional**
   - Improve → "Auto-fill missing images": same as toolbar button (runs autofill, no modal).
   - Single-product "Add image" / magic wand: if draft store not ready, only a toast; no Finish setup modal.
