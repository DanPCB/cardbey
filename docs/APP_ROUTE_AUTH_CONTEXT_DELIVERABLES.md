# Mission Console (/app) auth context – deliverables

## Summary

Ensure Mission Console and all `/app` routes use the same authentication context as the main site, so that when the user is signed in, `/app` shows the user dropdown and API calls (e.g. `POST /api/campaign/validate-scope`, `POST /api/campaign/create-from-plan`) are authenticated.

## Risk (assessed)

- **Auth/session:** Reusing existing `useCurrentUser()` and `isRealAuthed()`; no change to tokens or storage. Low risk.
- **Routing:** No route or RequireAuth changes; `/app` remains under `RequireAuth` and same root layout.
- **Mission execution:** Step handlers already use `postCampaignValidateScope` / `postCampaignCreateFromPlan` from `api.ts` with same `request()` (credentials + `buildAuthHeader()`). Showing user in the console does not change how requests are sent; it ensures the same React/query context is used so the UI and API both see the same auth state.

## Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/WorkspaceHeader.tsx` | Uses same auth as main site: `useCurrentUser()`, `getTokens()`, `isRealAuthed()`. When authenticated: user dropdown (display name, Account link, Sign out). When not authenticated and not loading: "Sign in" link. Dev-only log: `[Mission Console /app] current user: <id> \| no user`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleShell.tsx` | Imports `useCurrentUser`; dev-only `useEffect` logs `[ConsoleShell /app root] user id: <id> \| no user` so auth state at `/app` root is visible in console. No layout or provider change. |

## Layout and session (confirmed)

- **Same provider tree:** `/app` is rendered inside the same root as home: `QueryClientProvider` → `ThemeProvider` → … → `AppShell` → `Routes`. So `/app` is not in a separate auth or layout tree.
- **RequireAuth:** `/app` is wrapped in `<RequireAuth><ConsoleShell /></RequireAuth>`. Unauthenticated users are redirected to `/login?returnTo=...`.
- **Session bootstrap:** In `App.jsx`, `checkAuthStatus()` runs on mount when `!isPublicPage`. `/app` is not in `isPublicPage`, so auth is bootstrapped when the user navigates to or lands on `/app`.
- **Cookie / proxy:** Auth uses Bearer token in `Authorization` header (from `buildAuthHeader()` and localStorage). Vite dev proxy already forwards `Authorization` and `Cookie` (`vite.config.js` proxy `configure`). Cookie path/domain rewrite is set (`cookiePathRewrite: '/'`, `cookieDomainRewrite: ''`). No change made.

## Debug log gating

- **WorkspaceHeader:** `import.meta.env?.DEV !== true` → skip log.
- **ConsoleShell:** `import.meta.env?.DEV !== true` → skip log.
- No token or secret is logged; only user id or `"no user"`.

Remove or keep these logs behind the same DEV gate; they are safe to leave in for dev debugging.

## Manual QA steps

1. **Sign in on home**
   - Open app (e.g. `http://localhost:5174/`).
   - Sign in; confirm user dropdown is visible in the header.

2. **Go to /app**
   - Navigate to `/app` (Mission Console).
   - **Acceptance:** Top right of the Mission Console header shows the **user dropdown** (same user as home), not "Sign in".
   - In browser console (dev): you should see logs like `[Mission Console /app] current user: <id>` and `[ConsoleShell /app root] user id: <id>`.

3. **Run a mission**
   - From `/app` or `/app/missions`, start a mission that runs "Validate campaign scope" and "Create campaign".
   - **Acceptance:** Server logs (core) show **authenticated** for both:
     - `[Campaign] POST /validate-scope authenticated`
     - `[Campaign] POST /create-from-plan authenticated`
   - **Acceptance:** `create-from-plan` returns **200** with `campaignId` (no 404 from missing auth).
   - **Acceptance:** PhaseOutputs load plan/campaign (no 404 for GET plan / by-mission once data exists).

4. **Unauthenticated**
   - Sign out or open app in incognito; go to `/app`.
   - **Acceptance:** Redirect to login (RequireAuth). After sign-in with `returnTo=/app`, you land on `/app` with user dropdown visible.

## If server still shows "anon"

- Confirm client sends `Authorization` (browser devtools → Network → request headers for `create-from-plan`).
- Use existing `[Campaign API] ... Authorization header: set|not set` log in dashboard `api.ts` (dev) to see if the header is set.
- If header is set but server still logs anon, backend may be reading a different header or cookie; check core auth middleware and proxy.
