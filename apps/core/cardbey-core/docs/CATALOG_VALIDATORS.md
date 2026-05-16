# Catalog Validators

Validators provide a **strong validators layer** so generated stores are publishable: completeness, price sanity, business-type coherence, and image requirements. They are **not** attached to store creation yet; they are feature-flagged and manually callable.

## Current API

- **`validatePack({ pack, items, categories, rules, itemIdResolver? })`** → `ValidationIssue[]`  
  Run all enabled rules for a pack and its items/categories.

- **`validateCatalogItems(items, rules, itemIdResolver?)`** → `ValidationIssue[]`  
  Pure function: validate items with rules only (no pack/categories). Use for item-level checks.

- **`summarizeIssues(issues)`** → `{ blocks, warns, byCode }`  
  Aggregate counts by severity and by rule code.

- **Default rules** (in `validators/defaultRules.ts`):  
  - **requiredFields** – BLOCK if missing canonicalName / category / type (enabled by default).  
  - **priceSanity** – WARN if price outside pack ladder (disabled).  
  - **imageRequired** – WARN if GRID displayMode and no imagePrompt/imageKeywords (disabled).  
  - **businessTypeCoherence** – BLOCK if item hints conflict with pack businessType (disabled).

## Rules

| Rule | Config | Behavior |
|------|--------|----------|
| `requiredFields` | — | Blocks on missing canonicalName, categoryKey/defaultCategoryKey, type. |
| `priceSanity` | `byCategoryKey: { key: { min, max } }` | Warns when item price outside category ladder. |
| `businessTypeCoherence` | — | Blocks when item `businessTypeHints` do not include pack `businessType`. |
| `imageRequired` | `displayMode: 'GRID' \| 'LIST'` | GRID: warns if no imagePrompt and no imageKeywords; LIST: no check. |

## How validators will plug into store generation (later)

1. **Before commit / publish**  
   When the user (or system) is about to commit a draft store or mark it publishable, call `validatePack` (or `validateCatalogItems` on the draft’s items) with the appropriate rules. If `summarizeIssues(issues).blocks > 0`, block the action and surface issues in the UI.

2. **After starter pack instantiation**  
   When `instantiatePackToDraftStore(packId, draftStoreId)` is implemented, run `validatePack` on the instantiated pack’s items and categories. Store the result in draft metadata or show a “readiness” score and list of blocks/warns.

3. **Feature flag**  
   Gate “run validators on save/publish” behind a feature flag so existing flows are unchanged until the UI and product are ready.

4. **Config source**  
   Rules can stay in code (e.g. `DEFAULT_VALIDATOR_RULES`) or later be loaded from DB (`ValidatorRule` table) so admins can enable/disable or tune severity per tenant.

No runtime app integration exists yet; validators are only used in tests and when called explicitly (e.g. from a future CLI or API).
