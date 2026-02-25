# Security / Data Isolation: MY STORES Cross-Account Fix

## Which path was true

**Path B (frontend cache/state leak)** — with backend already correct.

### Evidence

- **Endpoint that populates "MY STORES":** **GET `/api/auth/me`** (Bearer token in `Authorization` header).
- **Response shape:** `{ ok: true, user: { id, email, displayName, ..., stores: [...], hasStore } }`.  
  `stores` is built from Prisma `include: { business: true }` (User 1:1 Business), so at most one store per user.

**Account A (jo'sbanhmi@…):**

- Request: `GET /api/auth/me` with A’s Bearer token.
- Response: `user.stores` contains the business where `Business.userId === A’s user id` (e.g. "JO'S BANH MI & BREW").

**Account B (test@…):**

- Request: `GET /api/auth/me` with B’s Bearer token.
- Backend returns: `user.stores` = `[]` (or only B’s store if B has one), because the handler uses **only** `req.userId` from the JWT (set by `requireAuth`). There is no use of client-supplied user/store id in auth/me.

So if B **still saw** A’s store in the UI, the backend was not returning it for B; the UI was showing **cached** data from when A was logged in. Cause: React Query key was `['currentUser']` for all users, with a 10‑minute `staleTime`, so after switching to B (or logging in as B in another tab), the app could keep showing A’s cached `currentUser` (including A’s `stores`) until a refetch ran.

---

## Minimal fix implemented

### 1. Frontend: user-specific cache key (Path B)

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts`

- Added `getTokenUserIdForCache()`: decodes the JWT payload (no verify), returns `sub` or `userId` or `'no-token'`.
- **Query key** changed from `['currentUser']` to **`['currentUser', tokenUserId]`**.
- Effect: Cache is per user. When B logs in (same or different tab), the key becomes `['currentUser', B’s id]`, so A’s cached data is never reused for B. No cross-user leakage from React Query cache.

### 2. Sign-out: clear auth-sensitive caches

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/layout/PublicHeader.tsx`

On "Sign out":

- `clearTokens()` (unchanged).
- `queryClient.removeQueries({ queryKey: ['currentUser'] })` — prefix match removes all `['currentUser', ...]` entries.
- **Added:** `clearStoreContextCache()` so store context cache is not reused for the next user.
- **Added:** `clearActiveStore()` so `cardbey.activeStore` in localStorage is cleared.

"MY STORES" is only ever sourced from the user-scoped API (GET /api/auth/me); we do not use store context to populate it. Clearing store context and active store prevents any other flows from carrying over the previous user’s store identity.

### 3. Backend: comment only (no logic change)

**File:** `apps/core/cardbey-core/src/routes/auth.js`

- Comment added at GET /api/auth/me: **"DATA ISOLATION: Use only req.userId from JWT (set by requireAuth). Do not use client params."**
- Confirms auth/me does not use query/body for user id; ownership filter is correct (Prisma `User` by `req.userId` with `include: { business: true }`).

---

## Summary

| Item | Implementation |
|------|----------------|
| **Ownership / list query** | Already correct: auth/me uses `req.userId` only; stores = user’s business(es). |
| **Frontend cache key** | `['currentUser', tokenUserId]` so cache is per user. |
| **Sign-out cleanup** | removeQueries(['currentUser']), clearStoreContextCache(), clearActiveStore(). |
| **Store context** | Not used to populate "MY STORES"; cleared on sign-out to avoid leaking store identity. |

---

## 5-step manual test checklist (isolation)

1. **Login A** → Open header dropdown → "MY STORES" contains "JO'S BANH MI & BREW".  
   In DevTools → Network: capture **GET /api/auth/me**; response `user.stores` has one item (A’s store).

2. **Sign out** → Login B (test@…) → Open header dropdown → **"MY STORES" is empty** (or only B’s stores if B has any).  
   In Network: **GET /api/auth/me** for B’s request shows `user.stores` = [] (or only B’s).

3. **Hard refresh (F5) while logged in as B** → Header "MY STORES" **still empty** (or only B’s). No A’s store.

4. **Sign out B → Login A again** → "MY STORES" shows A’s store again. No B’s store for A.

5. **Cross-tab:** Tab 1 logged in as A; Tab 2 open login, log in as B. Switch to Tab 1 and refresh or navigate so the app uses B’s token (e.g. shared localStorage). **Tab 1 must not show A’s store**; it should show B’s data (empty "MY STORES" or B’s stores).  
   (With the new key, Tab 1 will refetch with B’s token and get B’s data; no reuse of A’s cache.)
