# Guardrails Summary - ReferenceError Prevention

## Changes Made

### Frontend: ESLint Rules

**File:** `apps/dashboard/cardbey-marketing-dashboard/eslint.config.js`

**Changes:**
1. Added `'no-undef': 'error'` rule for JavaScript files (line 32)
2. Added `'no-undef': 'error'` rule for TypeScript files (line 58)

**Justification:**
- Prevents ReferenceError at build time by catching undefined variables
- TypeScript should catch this, but `no-undef` provides an additional safety net
- Fails build if any undefined variable is referenced
- Already has `no-unused-vars` rules, so this complements existing checks

**Impact:**
- Build will fail if any variable is referenced without declaration
- No production overhead (compile-time check only)
- Catches regressions before they reach runtime

---

### Backend: Runtime Assertion + Documentation

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Changes:**
1. Added guardrail comment explaining why `catalogOutput` must be declared (line 1790-1792)
2. Added dev-only runtime assertion (lines 1794-1800)

**Code:**
```javascript
// GUARDRAIL: Explicit declaration prevents ReferenceError if variable is accidentally removed
// This declaration MUST remain in this scope for error handling at line ~2683
let catalogOutput = null;
let foundStageName = null;

// GUARDRAIL: Runtime assertion to catch regressions (only in dev to avoid production overhead)
if (process.env.NODE_ENV === 'development') {
  // This will throw if catalogOutput is somehow undefined (should never happen with let declaration)
  if (typeof catalogOutput === 'undefined') {
    throw new Error('[GUARDRAIL] catalogOutput must be declared with let/const, not undefined. Check variable declaration at line ~1791.');
  }
}
```

**Justification:**
- **Primary prevention:** Declaration-based (`let catalogOutput = null`) prevents undefined
- **Secondary guard:** Dev-only assertion catches edge cases (e.g., if declaration is accidentally removed)
- **Documentation:** Comment explains why variable must be in outer scope
- **Zero production overhead:** Assertion only runs in development

**Impact:**
- Prevents accidental removal of variable declaration
- Catches regressions during development
- No performance impact in production

---

### Frontend: Dead Code Check

**Verification:**
- ✅ No references to `pollingStatus`, `setPollingStatus`, `pollingIntervalRef`, or `pollingAttemptsRef` found
- ✅ All `import.meta.env.DEV` blocks checked - no deleted variable references
- ✅ All debug blocks use only currently defined variables

**Status:** Clean - no dead code blocks found

---

## Prevention Strategy

### 1. **Declaration-Based Prevention (Primary)**
- Variables are explicitly declared with `let`/`const` in correct scope
- This is the best prevention - if variable is declared, it cannot be undefined

### 2. **Compile-Time Checks (Secondary)**
- ESLint `no-undef` rule catches undefined variables at build time
- TypeScript type checking catches undefined variables
- Build fails before code reaches production

### 3. **Runtime Assertions (Tertiary - Dev Only)**
- Dev-only assertions catch edge cases during development
- Zero production overhead
- Provides clear error messages if regression occurs

---

## Testing the Guardrails

### Frontend:
```bash
# Should fail build if undefined variable is referenced
npm run lint

# Example error if undefined variable exists:
# error  'pollingStatus' is not defined  no-undef
```

### Backend:
```bash
# In development, if catalogOutput declaration is removed:
# Error: [GUARDRAIL] catalogOutput must be declared with let/const, not undefined.
```

---

## Maintenance Notes

1. **ESLint rules are permanent** - they will catch issues in future PRs
2. **Backend assertion is dev-only** - safe to keep in production code
3. **Comments explain why** - future developers understand the guardrail purpose
4. **No performance impact** - all checks are compile-time or dev-only

---

## Future Recommendations

1. Consider adding similar guardrails for other critical variables:
   - `generationRunId` (already validated, but could add assertion)
   - `storeId` (already validated, but could add assertion)

2. Consider adding a pre-commit hook to run ESLint:
   - Catches issues before code is committed
   - Prevents regressions from reaching CI

3. Consider adding TypeScript strict mode if not already enabled:
   - Catches undefined variables at compile time
   - Provides better type safety

