# Mission Control Auth Redirect — Root Cause & Smallest Safe Fix

**Goal:** Let guest users use the create-store mission flow (start mission, fill input, generate draft, review draft) without being redirected to `/login?returnTo=/app`. Auth only at publish/claim.

---

## 1. Root cause

### Exact redirect source

| What | Where |
|------|--------|
| **Redirect** | `navigate(\`/login?returnTo=${returnTo}\`, { replace: true })` with `returnTo` = current path (e.g. `/app` or `/app/missions/:id`) |
| **File** | `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx` |
| **Component** | **`RequireAuth`** (function component, lines ~238–265) |
| **Logic** | `realAuthed = isRealAuthed(tokens, user, isLoading)`; if `!realAuthed && !isLoading` → redirect to login. Renders `null` while loading or not authed. |
| **Route boundary** | The **entire `/app` route** was wrapped with `<RequireAuth>`: `<Route path="/app" element={<RequireAuth><ConsoleShell /></RequireAuth>}>`. So **any** visit to `/app`, `/app/missions`, `/app/missions/:missionId` went through this single guard. |

### Why guests were redirected

- **`isRealAuthed`** is defined in `src/lib/authSession.ts`:
  - Requires: any auth token + user loaded + **`user.role !== 'guest'`**.
- So:
  - **No token** (first-time visitor) → not “real authed” → redirect.
  - **Guest token + user.role === 'guest'** → not “real authed” → redirect.
- There was **no separate gate** for Mission Control; the same `RequireAuth` wrapped the whole `/app` tree, so the **boundary was the whole /app shell**.

### No other redirect sources for this flow

- **StoreReviewGate** is used only for `/app/store/:storeId/review`; for `storeId === 'temp'` it does **not** use RequireAuth, so temp draft review was already guest-safe.
- **ConsoleShell** and mission components do not perform auth redirects; they rely on the route element.
- No route loaders or other guards were found that redirect to `/login?returnTo=/app` for Mission Control.

---

## 2. Route protection boundaries

### A. Guest-safe routes (before fix)

| Route | Guard | Notes |
|-------|--------|------|
| `/` | None | Homepage |
| `/create` | None | Quick Start create page; public |
| `/app/store/temp/review` | **StoreReviewGate** | For `storeId === 'temp'` → no RequireAuth; guest can view/edit draft |
| `/preview/*`, `/mi/job/:jobId` | None or public | As configured |

### B. Auth-protected routes (unchanged)

| Route | Guard | Notes |
|-------|--------|------|
| `/app` (Mission Control) | **Was:** RequireAuth → **Now:** RequireAuthOrGuest | See fix below |
| `/app/missions`, `/app/missions/:missionId` | Same as `/app` (nested under same element) | One guard for whole tree |
| `/app/store/:storeId/review` when `storeId !== 'temp'` | StoreReviewGate → RequireAuth | Real store draft review |
| `/app/store/:storeId/publish-review` | RequireAuth | Publish flow |
| Dashboard, account, billing, etc. | RequireAuth | Unchanged |

### Where the problem was

- The **entire /app shell** was protected by **RequireAuth**.
- So **every** Mission Control path (`/app`, `/app/missions`, `/app/missions/:id`) required “real” auth; guests and users with no token were sent to `/login?returnTo=/app` (or the current path).
- The mission detail route and nested components did not add an extra auth check; the single route-level guard caused the redirect.

---

## 3. How Quick Start avoids auth today

| Aspect | Quick Start | Mission Control (before fix) |
|--------|-------------|------------------------------|
| **Entry route** | **`/create`** — no RequireAuth in App.jsx | **`/app`** — wrapped in RequireAuth |
| **Page** | CreatePage (public) | ConsoleShell (required “real” auth) |
| **Guest session** | Before calling backend: **`ensureAuth()`** → `getOrCreateGuestSession()` → token in localStorage | Not reached; user redirected to login before any mission UI |
| **Draft generation** | User submits on /create → ensureAuth() + orchestra/start → job created with guest token | Would use same backend; but user never got to mission UI |
| **Draft review** | Navigate to **`/app/store/temp/review?jobId=...`**; **StoreReviewGate** allows `storeId === 'temp'` without RequireAuth | Same URL is guest-safe; but user could not reach Mission Control to start the mission that leads there |
| **Identity** | Guest: POST /api/auth/guest → token + user.role === 'guest' | Same guest mechanism; guard did not allow guest to reach /app |
| **Auth required** | At **publish** in StoreDraftReview: sign-in modal, then claimGuestDraft, then continue | Publish still protected in StoreDraftReview; only entry to /app was blocked |

**Minimum difference:** Quick Start uses a **public route** (`/create`) and **guest-allowed draft review** (`/app/store/temp/review` via StoreReviewGate). Mission Control used a **single RequireAuth** on `/app`, so guests never got to the mission UI. No new identity model was needed; only the **route guard** for `/app` had to allow “auth or guest.”

---

## 4. Smallest safe fix (already applied)

### Option chosen: **Option A / C** — make Mission Control entry/detail guest-safe, keep publish protected

- **Change:** Use a **guest-allowed** guard for the `/app` route only; keep RequireAuth everywhere else (including publish).
- **Exact change:**

  1. **`src/lib/authSession.ts`**
     - Added **`isAuthedOrGuest(tokens, user, loading)`**: true when there is any auth token, not loading, and user is loaded (real or guest). Used only for this guard.

  2. **`src/App.jsx`**
     - Added **`RequireAuthOrGuest`**:
       - If **`isAuthedOrGuest`** → render children (allow access).
       - If **no token** → call **`getOrCreateGuestSession()`** once, set token and canonical context, dispatch `authchange` (same as Quick Start). On success, re-render and allow. On failure (e.g. GUEST_DISABLED) → redirect to `/login?returnTo=...`.
       - If token but no user (e.g. invalid/expired) → redirect to login.
     - **`/app` route** (Mission Control): **element** changed from `<RequireAuth><ConsoleShell /></RequireAuth>` to **`<RequireAuthOrGuest><ConsoleShell /></RequireAuthOrGuest>`**.

- **Where applied:** Only the **single route element** for `path="/app"` in `App.jsx`; no change to ConsoleShell, mission components, or other routes.
- **Why safe:** Same guest mechanism as Quick Start; no new routes; publish and account/billing still use RequireAuth. Only the gate at `/app` was relaxed to “auth or guest.”

---

## 5. Publish auth boundary (unchanged)

- **Publish** is still protected:
  - **StoreDraftReview** (draft review page) uses **gatekeeper / requireAuth** for publish and certain edits; guests get the sign-in/sign-up modal with `returnTo`.
  - After sign-in, **`claimGuestDraft({ draftId })`** is used; then publish continues with the real account.
- **RequireAuthOrGuest** is used only for the `/app` route (Mission Control shell). It does not wrap StoreReviewGate or publish-review routes. So the auth boundary at **publish / claim** is preserved.

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Other /app/* routes become guest-accessible | Only the **Mission Control** tree under `/app` (index, missions, missions/:id, threads/:id) is under RequireAuthOrGuest. No other routes were changed. |
| Guest session creation fails (e.g. GUEST_DISABLED) | RequireAuthOrGuest redirects to `/login?returnTo=...` on failure; user can sign in. |
| Token present but invalid/expired | Second effect in RequireAuthOrGuest: if hasToken but no user and not loading → redirect to login. |
| Accidentally weakening publish | RequireAuthOrGuest is only used for the `/app` route element. Publish and publish-review routes still use RequireAuth or StoreReviewGate (RequireAuth for non-temp store). |

**What should not be touched:**

- Do not change **RequireAuth** behavior for other routes (dashboard, account, billing, publish-review, etc.).
- Do not remove or relax **StoreDraftReview** publish gating or **claimGuestDraft**.
- Do not change **isRealAuthed** (used for login redirect and other RequireAuth routes).

---

## 7. Manual verification checklist

- [ ] **Guest opens create flow** — Incognito (or clear storage), open `/app`. Expected: no redirect to login; after brief load, Mission Console home (title, input, Run, pills).
- [ ] **Guest starts create-store mission** — Enter “Create a store for my business” (or pill) and Run. Expected: navigate to `/app/missions/:missionId`; mission summary and Store input visible.
- [ ] **Guest fills input** — Fill Business name (required), optionally type/location. Expected: Confirm & Run enables; no redirect.
- [ ] **Guest generates draft** — Click Confirm & Run. Expected: execution starts; drawer/progress; no redirect; on completion, draft review link available.
- [ ] **Guest reviews draft** — Open draft review (e.g. Open Draft Review from mission/drawer). Expected: `/app/store/temp/review?jobId=...` loads without sign-in; guest can view/edit draft.
- [ ] **Guest clicks publish** — On draft review, click Publish (or equivalent). Expected: sign-in/sign-up modal or redirect to login with returnTo; after sign-in, claim and publish continue.
- [ ] **Auth only at publish** — No sign-in required for: opening `/app`, creating mission, filling store input, Confirm & Run, opening draft review. Sign-in required only when attempting publish (or other gated actions in StoreDraftReview).

---

## Summary

- **Redirect source:** `App.jsx` — **RequireAuth** wrapping the `/app` route; redirect to `/login?returnTo=...` when `!isRealAuthed` (no token or guest).
- **Quick Start:** Uses public `/create` and guest-allowed `/app/store/temp/review` (StoreReviewGate); `ensureAuth()` creates guest session before backend calls.
- **Fix:** Use **RequireAuthOrGuest** (and **isAuthedOrGuest**) only for the `/app` route; create guest session when no token; leave all other routes and publish gating unchanged.
- **Status:** This fix is already implemented in the codebase; the checklist above confirms the intended behavior.
