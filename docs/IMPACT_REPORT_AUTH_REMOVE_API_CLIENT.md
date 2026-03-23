## Impact Report: Remove `@cardbey/api-client` from dashboard `services/auth.ts`

### What could break
1. **Login/Register flows** could fail if the backend response shape differs from what this file previously mapped from `@cardbey/api-client` (for example token field names like `accessToken` vs `token`).
2. Error handling might change slightly (error messages or attached properties like `status`/`details`), which could affect UI messages or retry logic.

### Why
Render’s production build fails with:
`Rollup failed to resolve import "@cardbey/api-client" from ".../src/services/auth.ts".`

The standalone build environment doesn’t have the workspace-only `@cardbey/api-client` package available, so bundling aborts before runtime.

### Impact scope
Only this file in the dashboard submodule:
- `apps/dashboard/cardbey-marketing-dashboard/src/services/auth.ts`

### Smallest safe patch
1. Remove `@cardbey/api-client` imports.
2. Implement local `fetch` wrappers that call the same Core endpoints:
   - `POST /api/auth/login`
   - `POST /api/auth/register`
3. Preserve the exported API of this module:
   - `login(payload): Promise<LoginResponse>` (same mapping the file already returns)
   - `register(payload): Promise<RegisterResponse>` (keep the `ok/user` handling already present)
4. On failure, throw an `Error` and attach:
   - `status` from `res.status`
   - `details` as the parsed JSON payload (if any)

### Planned verification
1. Run `pnpm run build:dashboard` (tracked dashboard submodule) to ensure Rollup no longer fails on `@cardbey/api-client`.
2. Manually sanity-check that login/register still returns tokens and a user object (or at least that errors surface cleanly) after deploy.

