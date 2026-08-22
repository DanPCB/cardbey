# IMPACT — Business Overview nested route closure

**Authorization:** `ACK OVERVIEW_ROUTE_CLOSURE_THEN_STYLE_CONVERGENCE_C1` (Step 1)  
**Date:** 2026-08-21  
**Verdict:** `BUSINESS_OVERVIEW_ROUTE_AND_ENTRY_VERIFIED`

## Problem

Canonical URL `/business/overview?storeId=…` matched `Route path="/business/:slug"`, which consumed `overview`. Nested `path="overview"` never matched, so `OverviewPage` (Phase B CTAs) did not mount.

## Canonical URL (confirmed)

`/business/overview?storeId=:storeId` — unchanged. Legacy `/dashboard/stores/:id` still redirects here via `StoreOverview`.

## Fix (minimal)

1. `App.jsx`: `/business/:slug` → `/business/:slug/*` so descendant routes can match.
2. `BusinessDashboard`: add **index** route that reads `:slug` via `BusinessBuilderSectionFromSlugParam` and renders the same page components (single `OverviewPage`, no duplicate).
3. `resolveBusinessBuilderSection.tsx`: shared section → page mapping for slug and splat paths.

## Tests

- `BusinessOverviewRoute.test.tsx` — mount under `/business/:slug/*`, Edit website / catalog / Shows / Style & preview helpers.
- `resolveBusinessBuilderSection.test.ts`

## Browser (disposable fixture)

Evidence: `apps/core/cardbey-core/tmp/phase3-browser-evidence/overview-route-results.json` (gitignored).

| Check | Result |
| ----- | ------ |
| OverviewPage mounts after hard refresh | Pass |
| Edit website invokes `openWebsiteEditing` (context request) | Pass |
| Edit catalog / Shows invoke WE helper | Pass (section deep-link covered by unit tests; Core `:3001` returned 404 for WE context in this process — navigation may toast until Core remounts `websiteEditingRoutes`) |
| Style & preview does not hit exact-lineage restore | Pass |
| Cross-store WE rejected | Pass |
| Mobile CTAs visible | Pass |
| No publish / no duplicate Business | Pass (read-only clicks) |

## Exclusions honored

No Website Editing resolver change, no ownership change, no duplicate OverviewPage, no push/deploy/live data.

## Next

Step 2 — Style convergence **C1** only (flags + read-only contract).
