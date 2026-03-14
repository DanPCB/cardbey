# Infinite Loop Diagnostic Report

## Error
```
Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.
```

## Timeline
- **Trigger**: After draft commit, navigation to `/onboarding/business?storeId=...&step=1`
- **Location**: `BusinessOnboardingWizard` component
- **Error occurs**: During initial mount/rendering

---

## Root Cause Analysis

### The Problematic useEffect

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/business-builder/onboarding/BusinessOnboardingWizard.tsx`  
**Lines**: 368-384

```typescript
useEffect(() => {
  // Check if URL explicitly sets step=1 (fresh start)
  const urlParams = new URLSearchParams(window.location.search);
  const urlStep = urlParams.get('step');
  if (urlStep === '1') {
    // URL says step 1 - don't override with saved state
    if (currentStep !== 1) {
      setCurrentStep(1);
      updateState({ currentStep: 1 });  // ⚠️ PROBLEM: Updates state.currentStep
    }
    return;
  }
  // Otherwise, sync with state (resume from saved step)
  if (state.currentStep && state.currentStep !== currentStep) {
    setCurrentStep(state.currentStep);
  }
}, [state.currentStep, currentStep, updateState]);  // ⚠️ PROBLEM: state.currentStep in deps
```

### The Loop Sequence

1. **Initial Mount**:
   - `useOnboardingState()` loads state from localStorage (may have `currentStep: 2` or other value)
   - `BusinessOnboardingWizard` initializes `currentStep` from `useState(() => stepFromUrl || state.currentStep || 1)`
   - If `state.currentStep` from localStorage is not 1, `currentStep` might be initialized to that value

2. **First useEffect Run** (line 368):
   - URL has `step=1`
   - Checks: `currentStep !== 1` → **TRUE** (if state had a different step)
   - Calls: `setCurrentStep(1)` ✅
   - Calls: `updateState({ currentStep: 1 })` ⚠️ **This updates `state.currentStep`**

3. **State Update Triggers Re-render**:
   - `updateState` calls `setState` in `useOnboardingState`
   - `state.currentStep` changes from old value → `1`
   - Component re-renders

4. **useEffect Runs Again** (because `state.currentStep` is in dependency array):
   - URL still has `step=1`
   - `currentStep` is now `1` (from `setCurrentStep(1)`)
   - Checks: `currentStep !== 1` → **FALSE**
   - Should return early... **BUT**

5. **The Problem**:
   - Even though the condition `currentStep !== 1` is false, React still processes the effect
   - The dependency `state.currentStep` changed, so React must re-run the effect
   - However, there's a **race condition**: `setCurrentStep(1)` is async, and `updateState({ currentStep: 1 })` is also async
   - On the next render, `state.currentStep` is `1`, but `currentStep` might still be the old value momentarily
   - This causes the condition to be true again → **LOOP**

### Additional Contributing Factors

#### Factor 1: Autosave useEffect
**File**: `useOnboardingState.ts`, Lines 233-249

```typescript
useEffect(() => {
  if (!isDirty) return;
  // ... autosave logic
}, [state, isDirty, saveState]);  // ⚠️ Depends on entire `state` object
```

- When `updateState({ currentStep: 1 })` is called, it sets `isDirty: true`
- This triggers the autosave useEffect
- The autosave depends on the entire `state` object, which changes when `currentStep` is updated
- This may cause additional re-renders

#### Factor 2: State Initialization Race
**File**: `BusinessOnboardingWizard.tsx`, Lines 79-85

```typescript
const [currentStep, setCurrentStep] = useState(() => {
  if (stepFromUrl === 1) {
    return 1;
  }
  return stepFromUrl || state.currentStep || 1;  // ⚠️ Uses state.currentStep
});
```

- `state.currentStep` is used in the initializer
- If `state` is loaded from localStorage with a different step, `currentStep` might be initialized incorrectly
- Then the useEffect tries to "fix" it, causing the loop

#### Factor 3: updateState Dependency
**File**: `BusinessOnboardingWizard.tsx`, Line 384

```typescript
}, [state.currentStep, currentStep, updateState]);
```

- `updateState` is included in dependencies
- While `updateState` is wrapped in `useCallback` with empty deps (stable), having it in the dependency array is unnecessary
- More importantly, `state.currentStep` changing triggers the effect, which calls `updateState`, which changes `state.currentStep` again

---

## Exact Loop Sequence

```
Render 1:
  - state.currentStep = 2 (from localStorage)
  - currentStep = 2 (initialized from state)
  - useEffect runs: currentStep !== 1 → TRUE
  - setCurrentStep(1) called
  - updateState({ currentStep: 1 }) called
  - state.currentStep = 1 (updated)

Render 2:
  - state.currentStep = 1 (updated)
  - currentStep = 1 (from setCurrentStep)
  - useEffect runs: currentStep !== 1 → FALSE
  - Should return early...
  - BUT: React sees state.currentStep changed, so effect must run
  - Race condition: currentStep might not be 1 yet in some cases
  - OR: updateState causes another state change that triggers re-render

Render 3+:
  - Loop continues...
```

---

## Why It Happens Specifically After Signup

1. **New Store Created**: After signup, a new `storeId` is created
2. **Navigation**: Navigate to `/onboarding/business?storeId=...&step=1`
3. **State Loading**: `useOnboardingState` loads from localStorage
4. **Old State**: If there's old onboarding state in localStorage (from previous session), it might have `currentStep: 2` or higher
5. **Conflict**: URL says `step=1`, but state says `currentStep: 2`
6. **Sync Attempt**: useEffect tries to sync them, but creates a loop

---

## Summary

**Primary Issue**: The useEffect at line 368-384 creates a feedback loop:
- It depends on `state.currentStep`
- It calls `updateState({ currentStep: 1 })` which updates `state.currentStep`
- This triggers the effect again
- Even with guards, race conditions cause the loop to continue

**Secondary Issues**:
1. `currentStep` initialization uses `state.currentStep` which may be stale
2. Autosave useEffect depends on entire `state` object, causing extra re-renders
3. No guard to prevent the effect from running when values are already correct

**Root Cause**: **Circular dependency** between `state.currentStep` (dependency) and `updateState({ currentStep: 1 })` (effect action).

---

## Files Involved

1. `BusinessOnboardingWizard.tsx` (lines 368-384) - The problematic useEffect
2. `useOnboardingState.ts` (lines 252-258) - The updateState function
3. `useOnboardingState.ts` (lines 233-249) - The autosave useEffect
4. `BusinessOnboardingWizard.tsx` (lines 79-85) - The currentStep initialization

---

## Fixes Applied

### 1. Removed updateState from Mount Effect
**File**: `BusinessOnboardingWizard.tsx`, Lines 369-404

**Change**: Removed `updateState({ currentStep: 1 })` call from mount effect
- Only calls `setCurrentStep(1)` locally
- State will be updated when user interacts (handleNext, handleBack)
- Prevents triggering autosave during mount

### 2. Fixed currentStep Initialization
**File**: `BusinessOnboardingWizard.tsx`, Lines 79-85

**Change**: Initialize `currentStep` only from URL, never from `state.currentStep`
- Prevents stale state from affecting initialization
- Always prioritizes URL step param

### 3. Added Ref Guards
**File**: `BusinessOnboardingWizard.tsx`, Lines 148-149

**Change**: Added refs to track sync status
- `hasSyncedStepRef`: Prevents effect from running multiple times
- `previousStateStepRef`: Tracks previous state value for comparison
- `isMountingRef`: Tracks if component is still mounting

### 4. Improved Autosave Effect
**File**: `useOnboardingState.ts`, Lines 232-249

**Change**: Added state comparison to prevent unnecessary autosave triggers
- Compares previous state with current state using ref
- Only autosaves if state actually changed (not just re-render)

### 5. Mount Effect Runs Once
**File**: `BusinessOnboardingWizard.tsx`, Line 404

**Change**: Effect has empty dependency array `[]`
- Runs only once on mount
- No circular dependency with `state.currentStep`

---

**Report Generated**: 2025-01-17  
**Status**: ✅ Fixes applied - should resolve infinite loop

