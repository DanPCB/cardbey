# Store Preview Overlay Positioning Audit Report

## Issue
The Store Preview Overlay is covering the entire viewport instead of staying within the business builder canvas window.

## Root Cause Analysis

### 1. **Positioning Issue (CRITICAL)**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/components/onboarding/StorePreviewOverlay.tsx:237`

**Problem:**
```tsx
className="fixed inset-0 z-[9998] bg-white shadow-2xl overflow-hidden flex flex-col"
```

**Issue:** Using `fixed inset-0` makes the overlay cover the entire viewport, not just the canvas area.

**Should be:** `absolute inset-0` with parent container having `position: relative`

### 2. **Mounting Location Issues**

#### A. BusinessDashboard.tsx (Line 239)
- **Location:** Mounted at root level of component
- **Parent:** No positioned container
- **Result:** `fixed` positioning escapes to viewport

#### B. DashboardShell.tsx (Line 27)
- **Location:** Mounted inside `<main>` which has `relative` positioning
- **Parent:** `<main className="flex-1 overflow-y-auto relative">`
- **Result:** Should work with `absolute`, but currently uses `fixed`

#### C. PageShell.jsx (Line 67)
- **Location:** Mounted at root level
- **Parent:** No positioned container
- **Result:** `fixed` positioning escapes to viewport

### 3. **Container Structure**

**Current Structure:**
```
BusinessDashboard (root)
  └─ StorePreviewOverlay (fixed - covers viewport) ❌
  └─ Routes
      └─ BusinessOnboardingWizard
          └─ Step4MenuImport
```

**Expected Structure:**
```
BusinessOnboardingFlow (relative)
  └─ BusinessOnboardingWizard (relative)
      └─ Step4MenuImport
  └─ StorePreviewOverlay (absolute - contained) ✅
```

## Fixes Required

### Fix 1: Change Positioning from `fixed` to `absolute`
- Change `fixed inset-0` to `absolute inset-0`
- Ensure parent containers have `position: relative`

### Fix 2: Mount Overlay Inside Canvas Container
- Move overlay from root level to inside the actual content area
- For onboarding: Mount inside `BusinessOnboardingFlow` wrapper
- For dashboard: Mount inside `DashboardShell` main content area

### Fix 3: Ensure Parent Containers are Positioned
- Add `position: relative` to containers that should contain the overlay
- Verify z-index stacking context

## Recommended Solution

1. **Change overlay positioning to `absolute`**
2. **Mount overlay inside the content wrapper, not at root**
3. **Ensure parent has `position: relative`**

















