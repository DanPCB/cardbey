# IMPACT REPORT — Strip "Create store:" from draft storeName + food CTA

**Date:** 2026-09-11  
**Status:** User-annotated preview — proceed with minimal sanitize

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Legitimate name starting with "Create store:" | Extremely unlikely business name | Prefix regex only; require colon / "for" form |
| Book CTA hidden for true booking businesses | Food menus wrongly get Book today | Gate: food/menu catalog → Order/Add, not Book |
| Existing drafts still dirty | Already persisted | Sanitize on `getDraft` read path |

## Smallest safe patch

1. Shared `sanitizeDraftBusinessName.js` — strip mission title prefix  
2. Apply on preview build + `getDraft` / `getDraftByGenerationRunId`  
3. Use shared helper in `structured_store_build`  
4. Website preview: do not enable Book for food/menu catalog modes
