# Impact Report: Light Theme + Better UX for “Generating your draft…” Screen

**Date:** 2026-02-06  
**Scope:** UI-only changes to the draft loading screen in `StoreReviewPage.tsx` (route: `/app/store/temp/review?mode=draft&jobId=...`).

## Risk assessment

| Risk | Mitigation |
|------|------------|
| **Theme affecting other pages** | All new styles are **local** to the loading/error return blocks in `StoreReviewPage.tsx`. No global CSS or theme tokens changed. |
| **Route / generation logic** | No changes to `showDraftPlaceholder` condition, polling, `useOrchestraJobUnified`, draft fetch, or SSE. Only JSX and local state for elapsed time and helper messages. |
| **Retry / Go back breaking job** | “Try again” calls existing `setPollTrigger((p) => p + 1)` (same as error-state Retry). “Go back” uses `navigate('/features')` (same as current “Start over”). Job ID remains in URL if user returns via browser. |
| **Public storefront** | This route is dashboard/performer only (`/app/store/...`). Branding kept consistent. |

## What could break

- **Nothing outside this screen.** Success transition to `StoreDraftReview` is unchanged. Loading store… and error blocks are only restyled (same behavior).

## Files touched

- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` only (loading block, draft-not-found block, error block — UI and local state only).

**Proceeding with scoped UI implementation.**
