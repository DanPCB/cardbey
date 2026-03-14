# Impact Report: Create Store on Live Going to Sign-in (Fix)

**Date:** 2026-03-13  
**Goal:** Fix "Create store" on live (cardbey.com) redirecting to sign-in so guests can create a store without logging in first.

## What could have broken

- **Login redirect for real store review:** Non-temp store review (`/app/store/:realId/review`) still uses `StoreReviewGate` (RequireAuth for non-temp). No change.
- **Publish flow:** Auth still required at publish/claim. No change.
- **Mission Console (/app):** Still uses RequireAuthOrGuest. No change.

## Why the issue happened

1. **Guest session creation failing on production** could cause RequireAuthOrGuest to redirect to `/login?returnTo=...` when users hit `/app`.
2. **Route matching:** `/app/store/temp/review` could be matched by the parent `/app` in some cases; the explicit temp route and public-page handling make draft review reliably auth-free.

## Impact scope

- **Homepage / Assistant:** "Create your store" sends **all users** (guests and logged-in) to **Mission Console (`/app`)** without sign-in/signup.
- **Mission Console:** Protected by RequireAuthOrGuest (creates guest session when needed; no redirect to login unless guest creation fails).
- **Draft review:** `/app/store/temp/review` is explicitly routed and treated as public (no auth required).
- **Other routes:** Unchanged (RequireAuth, StoreReviewGate for non-temp, publish, etc.).

## Smallest safe patch (applied)

1. **`apps/dashboard/cardbey-marketing-dashboard/src/routes/paths.ts`**  
   - `createStoreEntryRoute()` returns **`'/app'`** (Mission Console).  
   - "Create your store" from homepage/Assistant sends every user to Mission Console without sign-in/signup.

2. **`apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`**  
   - **Explicit route:** Added `<Route path="/app/store/temp/review" element={<StoreReviewPage />} />` before `/app/back` so `/app/store/temp/review` is never handled by the parent `/app`. No auth wrapper for this path.
   - **Public page:** `isPublicPage` now treats `/app/store/temp/review` as public (with or without `mode=draft`) so auth check is not triggered on mount for this path.

## Verification

- **Logged-out user:** Homepage → "Create your store" → lands on **Mission Console (`/app`)** without redirect to login (RequireAuthOrGuest creates guest session or allows through).
- From Mission Console, create-store flow → navigate to `/app/store/temp/review?jobId=...` → page loads without sign-in.
- **If live still redirects to sign-in:**
  1. **Cache:** Hard refresh (Ctrl+Shift+R) or try in a new incognito window so the latest bundle (with RequireAuth/RequireAuthOrGuest console-entry logic) is loaded.
  2. **Path normalization:** Both guards now normalize `path` (strip trailing slash) so `/app` and `/app/` are treated the same as console entry.
  3. **Guest API:** Ensure guest session is enabled and `POST /api/auth/guest` succeeds (e.g. GUEST_DISABLED or CORS/API errors can cause redirect only when *not* on console entry; on `/app` we never redirect even if guest fails).
- Real store review and publish flows still require auth; no change to existing guards.
