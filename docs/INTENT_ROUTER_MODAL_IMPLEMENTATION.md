# Intent Router Modal Implementation

**Date:** 2025-01-27  
**Status:** ✅ Complete  
**Goal:** Add "Step 1 — Ask Intent" modal that routes users to existing creation flows

---

## Files Changed

### 1. **NEW: `src/features/content-studio/components/IntentRouterModal.tsx`**
   - Created reusable modal component with intent selection
   - 6 intent options: Promotion, Social post, Screen ad, Menu/Product, Flyer/Poster, Just exploring
   - Optional "Describe your idea" textarea
   - Routes to existing flows based on selected intent
   - Passes `seedPrompt` query param when idea is provided

### 2. **`src/features/content-studio/components/ContentStudioHome.tsx`**
   - Added `intentModalOpen` state
   - Changed "Start Creating" button to open modal instead of direct draft creation
   - Added `id="content-studio-primary-actions"` to cards container for scrolling
   - Rendered `IntentRouterModal` component

### 3. **`src/features/content-studio/pages/TemplatePickerPage.tsx`**
   - Added `useSearchParams` to read query params
   - Auto-applies `category` filter from query param
   - Prefills search input with `seedPrompt` if provided
   - Maps category values to existing filter types:
     - `social` → 'social' filter
     - `screens` → 'screens' filter
     - `print` → 'promotion' filter (for now)

### 4. **`src/lib/promoHelpers.ts`**
   - Updated `CreatePromoDraftAndNavigateOptions` to accept `'content_studio'` and `'content-studio'` as valid source values

---

## Routing Logic

### Intent → Route Mapping

| Intent | Route | Notes |
|--------|-------|-------|
| **Promotion** | `createPromoDraftAndNavigate()` → `/app/creative-shell/edit/:instanceId?source=content_studio&intent=promotion` | Uses existing promo helper |
| **Social post** | `/app/creative-shell/templates?category=social&seedPrompt=...` | Auto-filters to social templates |
| **Screen ad** | `/app/creative-shell/templates?category=screens&seedPrompt=...` | Auto-filters to screen templates |
| **Menu/Product** | `/menu?seedPrompt=...` | Navigates to menu page |
| **Flyer/Poster** | `/app/creative-shell/templates?category=print&seedPrompt=...` | Auto-filters to print templates |
| **Just exploring** | Close modal, scroll to cards | No navigation |

### seedPrompt Handling

- If user enters an idea, it's passed as `seedPrompt` query param (URL encoded)
- Template picker pre-fills search input with `seedPrompt`
- Menu route receives `seedPrompt` as query param
- Promo flow receives idea directly via `createPromoDraftAndNavigate()`

---

## UI/UX Features

### Modal Design
- Clean, card-based intent selection
- Icons for each intent (lucide-react)
- Selected state with primary color highlight
- Optional idea textarea
- Cancel and Continue buttons (Continue disabled until intent selected)

### User Flow
1. User clicks "Start Creating" on Content Studio Home
2. Modal opens with 6 intent options
3. User selects an intent (required)
4. User optionally describes their idea
5. User clicks Continue
6. Modal routes to appropriate existing flow
7. If "Just exploring", modal closes and scrolls to cards

---

## Verification Checklist

### ✅ Modal Functionality
- [ ] Click "Start Creating" → modal appears
- [ ] All 6 intent options are visible with icons
- [ ] Selecting an intent highlights it
- [ ] Continue button is disabled until intent selected
- [ ] Idea textarea is optional
- [ ] Cancel button closes modal

### ✅ Routing - Promotion
- [ ] Select "Promotion", enter idea, Continue
- [ ] Routes to promo creation flow (no 404)
- [ ] Editor opens with instanceId
- [ ] Idea is passed to promo helper

### ✅ Routing - Social
- [ ] Select "Social post", enter idea, Continue
- [ ] Routes to `/app/creative-shell/templates?category=social&seedPrompt=...`
- [ ] Template picker shows social filter applied
- [ ] Search input is pre-filled with idea

### ✅ Routing - Screens
- [ ] Select "Screen ad", enter idea, Continue
- [ ] Routes to `/app/creative-shell/templates?category=screens&seedPrompt=...`
- [ ] Template picker shows screens filter applied

### ✅ Routing - Menu
- [ ] Select "Menu / Product", enter idea, Continue
- [ ] Routes to `/menu?seedPrompt=...`
- [ ] Menu page loads (no 404)

### ✅ Routing - Print
- [ ] Select "Flyer / Poster", enter idea, Continue
- [ ] Routes to `/app/creative-shell/templates?category=print&seedPrompt=...`
- [ ] Template picker shows print/promotion filter applied

### ✅ Routing - Explore
- [ ] Select "Just exploring", Continue
- [ ] Modal closes
- [ ] Page stays on Content Studio Home
- [ ] Cards are visible (scrolled into view if needed)

### ✅ No Errors
- [ ] No console errors
- [ ] No route loops or infinite redirects
- [ ] No broken navigation
- [ ] No MIME/dynamic import errors

---

## Key Improvements

1. **Unified Entry Point** ✅
   - "Start Creating" now routes through Intent Router
   - All creation flows accessible from one place

2. **No Feature Rebuild** ✅
   - Reuses existing promo helper
   - Reuses existing template picker
   - Reuses existing menu page
   - Only adds routing layer

3. **Idea Preservation** ✅
   - User's idea is passed forward via query params
   - Template picker pre-fills search with idea
   - Promo flow receives idea directly

4. **Consistent UX** ✅
   - Modal matches existing design system
   - Uses existing icons (lucide-react)
   - Follows existing color scheme

---

## Implementation Notes

- Modal is a controlled component (`open`, `onOpenChange`)
- Intent selection uses local state
- Routing logic is centralized in `handleContinue`
- Category mapping in TemplatePickerPage is extensible
- seedPrompt is URL-encoded for safety

---

**Implementation Complete** ✅  
**Ready for Testing** ✅

