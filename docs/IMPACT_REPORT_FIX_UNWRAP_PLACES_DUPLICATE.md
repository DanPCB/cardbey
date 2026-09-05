# Impact Report: Fix catalog crash — duplicate unwrapPlacesSearchRow

**Goal:** Unblock local catalog generation (`Identifier 'unwrapPlacesSearchRow' has already been declared` → empty Catalog).

## What could break
- Nothing intended: second export is identical dead duplicate.
- If any bundler relied on re-export quirks (none expected).

## Why
`businessEntityResolver.js` declares `export function unwrapPlacesSearchRow` twice → SyntaxError on import during catalog/research React step → `catalog incomplete, continuing` → empty `preview.items`.

## Impact scope
- `apps/core/cardbey-core/src/lib/storeResearch/businessEntityResolver.js`
- Existing import integrity test

## Smallest safe patch
Delete the second identical `unwrapPlacesSearchRow` export (keep one). Run import test.
