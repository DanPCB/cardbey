# IMPLEMENTATION REPORT — Unlimited image suggestion search (v1)

## Verdict

Image suggest is no longer hard-capped at 8. Preview search supports free-text query + pagination (Pexels up to 80/page, UI default 24 + Load more).

## Root cause

`POST /api/menu/images/suggest` defaulted `candidatesLimit` to 8 with max 20. Frontend never sent query/page/limit.

## Changes

| Layer | Change |
|-------|--------|
| `pexelsService.ts` | `page` param |
| `menuVisualAgent.ts` | `opts.query` / `opts.page`; default limit 24 |
| `menuRoutes.js` | `query`, `page`, `candidatesLimit` max 80 (default 24) |
| `menuImages.ts` | Client passes query/page/candidatesLimit |
| `ProductEditDrawer.tsx` | Search box + Load more + 24/page |
| `QuickEditImageField.tsx` | Same search/load-more UX |
| `ServiceQuickEditDrawer.tsx` | Sends limit 24 + query |

## Notes

- “Unlimited” = paginated search across Pexels (not a single infinite response).
- Bulk “normal” mode unchanged (still auto-applies one image).
