# IMPACT REPORT — Unlimited image suggestion search (v1)

## Intent

Edit Product / quick-edit "Suggest images" is capped at 8 Pexels results with no free-text search or pagination. Extend to searchable, paginated results (Pexels max 80/page) so users can keep searching beyond the initial 8.

## What could break

1. Clients that assume exactly 8 candidates (UI grids, tests).
2. Higher `candidatesLimit` increases Pexels API usage / latency.
3. Custom `query` could return less relevant images if empty/garbage (fallback to name+desc).

## Why

`POST /api/menu/images/suggest` defaults `candidatesLimit` to 8 (`Math.min(20, …)`). Frontend never sends limit/page/query. Label “8 suggestions” reflects that hard cap.

## Impact scope

- Core: `menuRoutes.js`, `menuVisualAgent.ts`, `pexelsService.ts`
- Dashboard: `menuImages.ts`, `QuickEditImageField.tsx`, `ProductEditDrawer.tsx`, `ServiceQuickEditDrawer.tsx` (same UX)

## Smallest safe patch

1. Backend: accept `query`, `page`, `candidatesLimit` (max 80); pass page to Pexels.
2. Client: send limit 24 default; UI search box + Load more (append next page, dedupe URLs).
3. Keep default behaviour when query/page omitted (still works for bulk suggest).

No storefront publish path change.
