## Impact Report: PublicStorePage `@cardbey/api-client` removal

### What could break
1. Public store page (`/s/:slug`) error handling may differ from the old `getPublicStore()` implementation.
2. If the backend response format is slightly different than expected (`{ ok, store }`), the UI may show the generic error branch instead of the “store not found” branch.

### Why
The page previously imported `getPublicStore` from `@cardbey/api-client`. It has been replaced with a local `fetch` wrapper calling `GET /api/public/stores/:slug` and throwing an error with `err.status = 404` for the “Store not found” case.

### Impact scope
Only `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/PublicStorePage.tsx` (public store storefront page).

### Smallest safe patch
1. Keep the same endpoint path: `GET /api/public/stores/:slug`.
2. Keep request semantics aligned with the previous client: `credentials: 'include'` and `Accept: application/json`.
3. Return `data.store` only when the response shape indicates success (`res.ok && data.ok && data.store`).

### Verification performed
- `pnpm run build:dashboard` completed successfully in a clean dashboard worktree after the change.

