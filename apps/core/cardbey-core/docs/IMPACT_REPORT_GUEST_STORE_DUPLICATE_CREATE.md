# Impact Report — Guest store duplicate create (chicken-food / -2 / -3)

**Date:** 2026-08-06  
**Status:** Implemented (unit tests passing)  
**Scope:** Guest create-store temp Business allocation + intake duplicate detection

---

## Summary

Guest create-store was creating a **new** inactive `Business` (`isGuestDraft: true`) on every successful build. Slug uniqueness then allocated `name`, `name-2`, `name-3`. Admin “Duplicate stores” correctly surfaces these groups.

### Principles Advanced
- Independence — guests keep one reusable draft store instead of a pile of dead temps
- Opportunity — not addressed
- Capability — not addressed
- Trade-offs — same guest + same store name reuses the existing guest draft Business (does not block intentional second stores for **active** logged-in users)

## What could break
1. Guest intentionally wanting a second draft with the same name — they reuse/overwrite the first guest temp instead of getting `-2`.
2. Intake duplicate UX may surface more often for guests who re-run create-store with the same name.
3. Product refresh on reused guest Business could replace prior catalog from the new draft (expected for resume).

## Why
1. `createGuestTempStoreFromDraft` always `business.create` + `generateUniqueStoreSlug`.
2. `findDuplicateStoreForUser` only queries `isActive: true`, so guest drafts are invisible.
3. Early-return path referenced `draftInput` before definition (broken idempotency).

## Smallest safe patch
1. Reuse existing guest draft Business for same `userId` + normalized name before create; attach `committedStoreId`.
2. Include `isGuestDraft: true` rows in duplicate detection for that owner.
3. Fix `draftInput` ReferenceError on existing `committedStoreId` return.

## Verification
- `storeDuplicateDetection.test.js` — guest draft rows included in owner lookup
- `guestTempStoreReuse.test.js` — same guest + same name reuses Business (no `chicken-food-2`)

## Cleanup note
Existing `-2`/`-3` rows remain until removed via admin “Delete duplicate”. Prevention only stops new same-owner guest piles. Different owners sharing a base slug (e.g. `n-fashion`) still get unique suffix slugs by design.
