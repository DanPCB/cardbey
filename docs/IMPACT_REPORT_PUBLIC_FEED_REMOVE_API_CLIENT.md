## Impact Report: Remove `@cardbey/api-client` from Public Feed components

### What could break
1. The public feed (`PublicFeedPage`) and store drawer (`StoreDetailView`) may render incorrectly if the Core API response shapes differ from what `@cardbey/api-client` returned (e.g., `{ ok, stores }` / `{ ok, store }` keys).
2. TypeScript-only changes (removing `PublicStore` type imports) could miss fields used at runtime, leading to UI regressions if fields like `products`, `avatarUrl`, or `bannerUrl` are absent/renamed.

### Why
Render’s Vite/Rollup build fails with `Failed to resolve import "@cardbey/api-client"` from `src/components/public/PublicFeedPage.tsx`. The workspace package `@cardbey/api-client` is not available in the standalone Render build environment.

This patch removes the dependency from the public feed components by:
1. Replacing `listPublicStores()` / `getPublicStore()` calls with local `fetch` wrappers hitting the same Core endpoints:
   - `GET /api/public/stores`
   - `GET /api/public/stores/:slug`
2. Replacing the `PublicStore` type import with a local interface matching the fields used by these components.

### Impact scope
Only these components in the dashboard submodule:
- `apps/dashboard/cardbey-marketing-dashboard/src/components/public/PublicFeedPage.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/components/public/StoreDetailView.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/components/public/CardStoreSwipeView.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/components/public/PublicCardView.tsx`

### Smallest safe patch
1. Keep endpoint paths identical to the existing API client behavior:
   - `GET /api/public/stores`
   - `GET /api/public/stores/:slug`
2. Keep request options aligned with the rest of the app:
   - `credentials: 'include'`
   - `headers: { Accept: 'application/json' }`
3. Preserve error handling enough for the existing UI branches (“No cards available”, “Store not found”) by throwing on non-OK responses.

### Verification performed
Planned follow-up (after approval):
1. Run `pnpm run build:dashboard` in a clean worktree.
2. Re-run Render deploy to confirm no further `@cardbey/api-client` resolution failures for public feed routes.

