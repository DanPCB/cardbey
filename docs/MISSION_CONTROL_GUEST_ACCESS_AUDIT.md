# Mission Control Guest Access — Audit & Implementation

**Goal:** Allow guest users to use the Mission Control create-store flow without signing in; require auth only at publish/claim.

---

## 1. Current root cause of early auth redirect

- **What happens:** Unauthenticated users who open `/app` (or `/app/missions`, `/app/missions/:id`) are redirected to `/login?returnTo=/app` (or the current path).
- **Where:** `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`
- **Exact mechanism:** The `/app` route is wrapped with `<RequireAuth>`. `RequireAuth` uses `isRealAuthed(tokens, user, isLoading)` from `lib/authSession.ts`. `isRealAuthed` is **false** when:
  - there is no auth token, or
  - the user is not loaded yet, or
  - the user’s `role === 'guest'`.
- So **both “no token” and “guest user”** are treated as not allowed, and `RequireAuth` redirects to `/login?returnTo=...`.
- **Route/layout causing it:** `<Route path="/app" element={<RequireAuth><ConsoleShell /></RequireAuth>}>` in `App.jsx` (around line 1093). The guard is **RequireAuth**; the layout inside it is **ConsoleShell** (which renders Mission Console home, mission list, mission detail via `<Outlet />`).

---

## 2. How Quick Start guest flow works today

- **Entry:** Public route `/create` (no `RequireAuth`). `CreatePage` lets the user enter store info and start generation.
- **Guest session:** Before calling the backend (e.g. orchestra/start), the flow uses `ensureAuth()` from `lib/quickStart.ts`. `ensureAuth()`:
  - If there is already a bearer/admin token → no-op.
  - Otherwise calls `getOrCreateGuestSession()` → `POST /api/auth/guest` → receives `userId`, `token`, etc.
  - Writes the token to `localStorage` (bearer, adminToken), sets `setCanonicalContext({ tenantId })`, and dispatches `authchange`.
- **Draft review:** After the job is started, the user is sent to **`/app/store/temp/review?jobId=...`**. That route is protected by **StoreReviewGate**, not `RequireAuth`. In `App.jsx`, `StoreReviewGate` does: if `storeId === 'temp'` → render children (no auth); else → wrap in `RequireAuth`. So **guests can open `/app/store/temp/review`** without being redirected to login.
- **Publish/claim:** In `StoreDraftReview`, when a guest clicks publish (or certain edit actions), the app opens the sign-in/sign-up modal (`useAuthPromptStore.open` with `returnTo`). After sign-in, `claimGuestDraft({ draftId })` is used to attach the temp draft to the real account before continuing publish. So the **auth boundary is at publish/claim**, not at mission start or draft review.

Reusable pieces: **`getOrCreateGuestSession`**, **`ensureAuth`**, **guest token in localStorage**, **StoreReviewGate for `storeId === 'temp'`**, **claimGuestDraft** and sign-in modal at publish.

---

## 3. Smallest safe change so Mission Control follows the same pattern

- **Option chosen:** Make `/app` use a **guest-allowed** guard instead of `RequireAuth`, and create a guest session when the user has no token (same as Quick Start). No new route (e.g. `/guest/app`); same paths, lower auth bar.
- **Implementation:**

  1. **`lib/authSession.ts`**  
     - Added **`isAuthedOrGuest(tokens, user, loading)`**: returns true when there is any auth token, not loading, and user is loaded (real or guest). Used only for the Mission Control gate.

  2. **`App.jsx`**  
     - Added **`RequireAuthOrGuest`**:
       - If `isAuthedOrGuest(tokens, user, isLoading)` → render children.
       - If there is **no token** and we’re not already creating a guest session → call `getOrCreateGuestSession()`, then set token in localStorage, `setCanonicalContext`, and dispatch `authchange` (same as Quick Start). Re-render so `useCurrentUser` sees the new token and guest user; then `isAuthedOrGuest` becomes true and children render.
       - If we have a token but no user and not loading → redirect to `/login?returnTo=...` (e.g. invalid/expired token).
       - While creating guest or while loading user → render `null` (brief loading).
     - **`/app` route** changed from `<RequireAuth><ConsoleShell /></RequireAuth>` to **`<RequireAuthOrGuest><ConsoleShell /></RequireAuthOrGuest>`**. All nested routes (`/app`, `/app/missions`, `/app/missions/:missionId`, etc.) are now guest-allowed.

- **Result:** Unauthenticated user opens `/app` → no token → `RequireAuthOrGuest` creates a guest session once → token and guest user are set → Mission Console (home, missions, mission detail) renders. They can create a mission, fill store input, click Confirm & Run. `quickStartCreateJob` (and operator path) already call `ensureAuth()` and use the same guest token. Draft review stays as today: `/app/store/temp/review` is already guest-accessible via **StoreReviewGate** for `storeId === 'temp'`. No new routes, no change to backend/orchestrator behavior.

---

## 4. Claim-on-publish behavior

- **Already in place** in `StoreDraftReview`:
  - Guest is detected (e.g. `gatekeeper.isGuestSession`).
  - Publish (and certain edits) open the sign-in/sign-up modal with `returnTo` so after auth the user comes back to the same page.
  - After sign-in, **`claimGuestDraft({ draftId })`** is called to attach the temp draft to the real account.
  - Then the publish flow continues with the real tenant/ownership context.
- **No change required** for “require sign in at publish; after auth, claim temp draft and continue publish.” Only the **entry** to Mission Control was moved from “require auth” to “allow guest or create guest.”

---

## 5. Route behavior (summary)

- **Solution used:** Make mission create/detail (and entire `/app` tree) **auth-optional** until publish, by switching the `/app` route from `RequireAuth` to **RequireAuthOrGuest**.
- **No new route** (e.g. `/create` or `/guest/missions/:id`) was added; `/app` and `/app/missions`, `/app/missions/:missionId` are unchanged URLs, with a lower auth requirement so guests can use them.
- **Store review** remains as before: `/app/store/:storeId/review` with **StoreReviewGate** (temp = no auth; real storeId = RequireAuth).

---

## 6. Manual verification steps

1. **Guest can open Mission Control**
   - In an incognito (or clean) window, open `/app`.  
   - **Expected:** No redirect to login. After a short loading, Mission Console home appears (Mission Console title, “What would you like to run?”, input, Run, suggestion pills).  
   - **Check:** `sessionStorage`/localStorage has a guest token; Network has `POST /api/auth/guest` (or equivalent) once.

2. **Guest can create a store mission**
   - From `/app`, enter “Create a store for my business” (or use a pill) and click Run.  
   - **Expected:** Navigate to `/app/missions/:missionId`. Mission summary and Store input (Form: business name, type, location) are visible.

3. **Guest can fill store input and run**
   - Fill Business name (required), optionally type and location. Click **Confirm & Run**.  
   - **Expected:** Execution starts; drawer/progress appears; no redirect to login. When the run completes, draft review link (e.g. Open Draft Review) is available.

4. **Guest can open draft review**
   - From mission completion or drawer link, open `/app/store/temp/review?jobId=...` (or with draftId/generationRunId as applicable).  
   - **Expected:** Draft review page loads without sign-in. Guest can view/edit draft.

5. **Auth required at publish**
   - As guest on draft review, click **Publish** (or equivalent “publish to live”).  
   - **Expected:** Sign-in/sign-up modal (or redirect to login with returnTo). After sign-in, flow continues and temp draft is claimed to the real account; publish completes.

6. **Real user still works**
   - Sign in, then open `/app`, create a mission, fill store input, Confirm & Run, open draft review.  
   - **Expected:** Same behavior as before; no regression.

7. **Mission list and switching**
   - As guest, create a second mission from `/app` and switch between missions.  
   - **Expected:** No redirect to login; mission list and detail work with the same guest session.

---

## 7. Files changed (minimal)

| File | Change |
|------|--------|
| `src/lib/authSession.ts` | Added `isAuthedOrGuest(tokens, user, loading)`. |
| `src/App.jsx` | Added `RequireAuthOrGuest` (guest session creation + allow when token+user); `/app` route now uses `RequireAuthOrGuest` instead of `RequireAuth`. |

No backend changes, no new routes, no change to orchestrator or quickStart job logic beyond the existing `ensureAuth()` usage. Claim-on-publish remains in StoreDraftReview as-is.
