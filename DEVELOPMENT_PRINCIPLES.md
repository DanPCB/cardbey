# Cardbey Development Principles

## Foundation Rules for System-Wide Development

**Version:** 1.0  
**Last Updated:** 2025-01-17  
**Applies To:** All codebases, all features, all developers

---

## 🎯 Core Principle: User Journey Integrity

### The Golden Rule
**Never optimize or dedupe by skipping user-facing steps in a workflow.**

User journeys are intentional sequences designed to guide users through a process. Each step serves a purpose:
- **Information gathering** (preview, review)
- **Decision points** (signup, confirmation)
- **Data entry** (forms, configuration)
- **Validation** (confirmation screens)

**Breaking this rule causes:**
- Confused users who miss critical information
- Incomplete data collection
- Broken state management
- Poor user experience
- Support burden

---

## 🔒 LOCKED RULE: Development Safety (Mandatory Pre-Check) – Entire Project

**Applies to:** Every function, code change, and new integration across the whole project (store creation, promotion, auth, API, UI, draft, publish, signage, campaigns, menu, etc.).

**Before writing or running ANY code changes:**

1. **Assess** whether the change (refactor, integration, or code generation) could change a process or break any existing functionality, workflow, or integration.
2. **If there is ANY risk of process change or potential damage:**  
   **STOP.** Do not apply changes yet. **Generate a report** and warn the user **to prevent unexpected outcome**. The report must include:
   - **(1) What could break** (e.g. login for temp users, promo save overwriting draft, API response shape change).
   - **(2) Why** (e.g. new middleware runs before optionalAuth, shared type narrowed, endpoint returns different keys).
   - **(3) Impact scope** (which areas/features/workflows are affected).
   - **(4) The smallest safe patch** (concrete, minimal change that achieves the goal without touching unrelated paths).
   Save the report (e.g. in `docs/` as `docs/IMPACT_REPORT_<short-name>.md`) or present it clearly so the outcome is traceable.
3. **Only proceed** after the report has been generated, the minimal safe approach has been proposed, and it is acknowledged.

**Report requirement:** Any new refactoring, integration, or code generation that could change a process or break something with potential damage **must** result in a generated report before changes are applied.

**Minimal safe approach:** Prefer local, minimal patches; do not change unrelated areas (auth, routing, API contracts, other features) unless the task explicitly requires it; use a single source of truth per concept.

*Encoded for AI in `.cursor/rules/development-safety-rule.mdc` (alwaysApply).*

---

## 📋 Rule 1: Workflow Steps Are Immutable

### Definition
A **workflow step** is any user-facing page, modal, or interaction that:
1. Displays information the user needs to see
2. Requires user action (click, input, confirmation)
3. Collects data needed for subsequent steps
4. Validates user understanding or consent

### Enforcement
**DO NOT:**
- ❌ Skip preview pages to "save time"
- ❌ Bypass confirmation modals for "power users"
- ❌ Route directly to later steps when earlier data exists
- ❌ Use dedupe/caching logic to skip UI steps
- ❌ Auto-advance through required user interactions

**DO:**
- ✅ Always show preview/review screens (even if data is cached)
- ✅ Always show confirmation modals (even if action is idempotent)
- ✅ Always collect required data (even if it exists in session)
- ✅ Use dedupe/caching only for **API calls**, not **UI steps**
- ✅ Allow users to proceed at their own pace

### Example: Draft Store Workflow

**❌ WRONG:**
```typescript
// Skipping preview for "optimization"
if (deduped && session.draftStoreId) {
  navigate('/onboarding'); // User never sees preview!
}
```

**✅ CORRECT:**
```typescript
// Dedupe API call, but still show preview
if (deduped && session.draftStoreId) {
  // Reuse existing draft data (skip API call)
  // But STILL show preview page
  navigate(`/preview/${session.draftStoreId}`);
}
```

---

## 📋 Rule 2: State vs. Presentation Separation

### Definition
**State** (data, cache, session) is separate from **Presentation** (UI, pages, modals).

### Enforcement
**DO NOT:**
- ❌ Use state existence to skip presentation
- ❌ Assume cached data means user saw the UI
- ❌ Skip screens because data is "already known"

**DO:**
- ✅ Use state to **pre-fill** forms (user still sees form)
- ✅ Use cache to **skip API calls** (user still sees loading state)
- ✅ Use session to **resume workflow** (user still sees current step)
- ✅ Always render the UI, even if data is cached

### Example: Form Pre-filling

**❌ WRONG:**
```typescript
// Skip form if data exists
if (cachedData) {
  submitForm(cachedData); // User never sees form!
}
```

**✅ CORRECT:**
```typescript
// Pre-fill form, but still show it
if (cachedData) {
  setFormData(cachedData); // Pre-fill
}
// Always render form (user can review/edit)
renderForm();
```

---

## 📋 Rule 3: Explicit User Intent

### Definition
Every workflow step must have **explicit user intent** - the user must actively choose to proceed.

### Enforcement
**DO NOT:**
- ❌ Auto-submit forms
- ❌ Auto-advance through steps
- ❌ Skip confirmation dialogs
- ❌ Assume user consent from previous actions

**DO:**
- ✅ Require explicit button clicks
- ✅ Show confirmation dialogs for destructive actions
- ✅ Allow users to review before proceeding
- ✅ Make user intent clear and explicit

### Example: Confirmation Dialogs

**❌ WRONG:**
```typescript
// Auto-delete without confirmation
if (user.isAdmin) {
  deleteItem(); // Dangerous!
}
```

**✅ CORRECT:**
```typescript
// Always show confirmation, even for admins
const handleDelete = () => {
  showConfirmDialog({
    message: 'Are you sure?',
    onConfirm: () => deleteItem(),
  });
};
```

---

## 📋 Rule 4: Progressive Disclosure

### Definition
Show information and collect data **progressively** - one step at a time, in logical order.

### Enforcement
**DO NOT:**
- ❌ Show all information at once
- ❌ Collect all data in one giant form
- ❌ Jump to advanced features before basics
- ❌ Skip onboarding/tutorial steps

**DO:**
- ✅ Break workflows into logical steps
- ✅ Show information when it's relevant
- ✅ Guide users through the process
- ✅ Allow skipping only when explicitly safe

### Example: Multi-Step Forms

**❌ WRONG:**
```typescript
// Show all 20 fields at once
<Form>
  <Field1 /> <Field2 /> ... <Field20 />
</Form>
```

**✅ CORRECT:**
```typescript
// Progressive disclosure
<Wizard>
  <Step1>Basic Info</Step1>
  <Step2>Details</Step2>
  <Step3>Advanced</Step3>
</Wizard>
```

---

## 📋 Rule 5: Validation Before Optimization

### Definition
Before optimizing (deduping, caching, skipping), **validate** that optimization doesn't break the user journey.

### Enforcement
**DO NOT:**
- ❌ Optimize without understanding the full workflow
- ❌ Cache UI steps (only cache data/API calls)
- ❌ Dedupe user interactions
- ❌ Skip steps "for performance"

**DO:**
- ✅ Map the complete user journey first
- ✅ Identify which steps are user-facing vs. data-only
- ✅ Optimize only data/API layers, never UI layers
- ✅ Test optimization doesn't break workflow

### Validation Checklist
Before any optimization:
- [ ] What is the complete user journey?
- [ ] Which steps are user-facing (must be shown)?
- [ ] Which steps are data-only (can be cached)?
- [ ] Does optimization skip any user-facing steps?
- [ ] Have I tested the optimized flow end-to-end?

---

## 📋 Rule 6: Type Safety for Workflows

### Definition
Use TypeScript types to **enforce** workflow rules at compile time.

### Enforcement
**DO:**
- ✅ Define workflow states as types
- ✅ Use discriminated unions for navigation targets
- ✅ Create type-safe navigation helpers
- ✅ Validate navigation at compile time

**Example:**
```typescript
// Type-safe workflow navigation
type WorkflowStep = 
  | { type: 'preview', draftId: string }
  | { type: 'signup', draftId: string }
  | { type: 'onboarding', storeId: string };

// Compiler prevents invalid navigation
function navigate(step: WorkflowStep) {
  // TypeScript ensures valid combinations
}
```

---

## 📋 Rule 7: Documentation of Intent

### Definition
Every workflow change must document **why** navigation happens, not just **what**.

### Enforcement
**DO:**
- ✅ Document the complete user journey
- ✅ Explain why each step exists
- ✅ Comment navigation logic with user journey context
- ✅ Update workflow diagrams when changing flows

**Example:**
```typescript
/**
 * Navigates user after draft generation.
 * 
 * User Journey:
 * 1. Generate draft → Preview (user sees menu)
 * 2. Preview → Signup (user creates account)
 * 3. Signup → Onboarding (user completes setup)
 * 
 * Rules:
 * - Uncommitted drafts MUST show preview first
 * - Committed stores can skip preview (already seen)
 */
function navigateAfterDraft(session: DraftSession) {
  // ...
}
```

---

## 🧪 Testing Requirements

### Every Workflow Change Must Include:

1. **New User Test**: Verify complete journey from start
2. **Resume Test**: Verify workflow resumes correctly from saved state
3. **Edge Case Test**: Verify dedupe/cache doesn't break flow
4. **Validation Test**: Verify all required steps are shown

### Test Template
```typescript
describe('Workflow: [Name]', () => {
  it('New user sees all required steps', () => {
    // Test complete journey
  });
  
  it('Resumed workflow shows current step', () => {
    // Test state restoration
  });
  
  it('Dedupe does not skip user-facing steps', () => {
    // Test optimization doesn't break flow
  });
});
```

---

## 🚨 Red Flags (Stop and Review)

If you see these patterns, **STOP** and review against these principles:

- ❌ `if (cached) { skipStep(); }`
- ❌ `if (deduped) { navigate('/later-step'); }`
- ❌ `if (user.isAdmin) { skipConfirmation(); }`
- ❌ `autoSubmit()` or `autoAdvance()`
- ❌ Navigation without comments explaining user journey
- ❌ Skipping preview/review/confirmation screens
- ❌ Using state existence to skip UI rendering

---

## 📚 Implementation Guidelines

### For New Features
1. **Map the user journey** - Document all steps
2. **Identify user-facing steps** - Mark which must be shown
3. **Design type-safe navigation** - Use TypeScript to enforce rules
4. **Write tests** - Cover new user, resume, and edge cases
5. **Document intent** - Explain why each step exists

### For Code Review
1. **Check workflow integrity** - Verify no steps are skipped
2. **Verify type safety** - Ensure navigation is type-safe
3. **Review tests** - Confirm all scenarios are covered
4. **Check documentation** - Verify user journey is documented

### For Refactoring
1. **Preserve user journey** - Don't change workflow steps
2. **Maintain type safety** - Keep navigation type-safe
3. **Update tests** - Ensure tests still pass
4. **Update documentation** - Keep docs in sync

---

## 🔧 Tools and Helpers

### Type-Safe Navigation Helpers
Use centralized navigation helpers that enforce workflow rules:
- `workflowNavigation.ts` - Type-safe navigation with validation
- Route constants - Centralized route definitions
- Navigation validators - Runtime validation of navigation targets

### Linting Rules (Future)
- ESLint rule: Detect navigation that skips user-facing steps
- Pre-commit hook: Validate workflow integrity
- Type checking: Ensure navigation types are used

---

## 📖 Related Documents

- `apps/dashboard/cardbey-marketing-dashboard/WORKFLOW_INTEGRITY_RULES.md` - Specific workflow rules
- `apps/dashboard/cardbey-marketing-dashboard/WORKFLOW_PROTECTION_IMPLEMENTED.md` - Implementation details
- API Documentation - Backend workflow endpoints
- Design System - UI component guidelines

---

## ✅ Success Criteria

A feature follows these principles if:

1. ✅ **Complete Journey**: User can complete workflow from start to finish
2. ✅ **No Skipped Steps**: All user-facing steps are shown
3. ✅ **Type Safety**: Navigation is type-safe and validated
4. ✅ **Documentation**: User journey is documented
5. ✅ **Tests**: All scenarios are tested
6. ✅ **Review**: Code review confirms workflow integrity

---

## 🎓 Examples by Domain

### E-commerce
- ❌ Skip cart review → Direct to checkout
- ✅ Show cart review → User confirms → Checkout

### Onboarding
- ❌ Skip tutorial → Direct to app
- ✅ Show tutorial → User completes → App

### Settings
- ❌ Auto-save without confirmation
- ✅ Show preview → User confirms → Save

### Data Entry
- ❌ Skip validation screens
- ✅ Show validation → User reviews → Submit

---

## 🔄 Continuous Improvement

These principles should be:
- **Reviewed quarterly** - Ensure they remain relevant
- **Updated as needed** - Reflect new learnings
- **Enforced in reviews** - Part of every code review
- **Taught to new developers** - Onboarding requirement

---

**Remember:** User journeys are designed for a reason. Optimize data and API calls, never user-facing steps.

**When in doubt:** Show the step. It's better to be explicit than to confuse users.

---

**Questions?** See `WORKFLOW_INTEGRITY_RULES.md` for specific implementation details.

**Violations?** Create an issue tagged `workflow-integrity` for review.
















