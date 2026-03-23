## Impact Report: Remove `@cardbey/api-client` from GreetingCardEditor

### What could break
1. The “Short signature / bio” update step could fail if the new request doesn’t match the backend expectations (endpoint, auth header name, or payload shape).
2. Because `saveProfileBio()` runs before draft/publish, any mismatch could still cause user-bio not to update (though the component currently treats this as non-blocking and only logs a warning).

### Why
Render’s production build fails with:
`Rollup failed to resolve import "@cardbey/api-client" from ".../src/components/mi/GreetingCardEditor.tsx".`

This component only uses `@cardbey/api-client` for `updateProfile`. The workspace package is not available in the standalone Render build environment.

The fix replaces the dependency by:
1. Removing the `updateProfile` import.
2. Adding a local `updateProfile()` helper that performs the same request semantics as other dashboard pages:
   - `PATCH /api/auth/profile`
   - `credentials: 'include'`
   - `Authorization: Bearer <accessToken>`
   - JSON payload `{ shortBio: string }`

### Impact scope
Only this file in the dashboard submodule:
- `apps/dashboard/cardbey-marketing-dashboard/src/components/mi/GreetingCardEditor.tsx`

### Smallest safe patch
1. Keep the existing behavior:
   - Only attempt the bio update if `user` exists and `localBio` differs from `user.shortBio`.
   - Use `getTokens()` to derive `accessToken` exactly as the component already does.
   - Preserve the existing try/catch that logs failures and does not block card saving/publishing.
2. Implement the local `updateProfile` helper by mirroring the working pattern already used in `src/pages/account/AccountProfilePage.tsx`.

### Planned verification
1. Build the dashboard locally with `pnpm run build:dashboard` (clean worktree if feasible).
2. Re-deploy to Render and confirm the next Rollup build passes (no further `@cardbey/api-client` resolution failures).

