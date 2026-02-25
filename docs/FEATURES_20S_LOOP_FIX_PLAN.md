# /features 20s loop fix – PLAN (no code)

## 1) PLAN – Exact code edits, why, risks, test checklist

---

### STEP 1 — TemplateCategorySlider: stop refetch on passive rotation

**Choice: Option 1 (preferred)** – Fetch suggestions once per tenantId/storeId (all categories), cache; rotation selects from cached data.

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/templates/TemplateCategorySlider.tsx`

**Edits:**

1. **Replace the single-category useQuery with an “all categories” query**
   - **Current:** `queryKey: ['templatesByCategory', activeCategoryKey, activeCategory.fetchConfig, tenantId, storeId]` → refetches whenever `activeCategoryKey` changes (every 7s or 20s on rotation).
   - **New:** One query with `queryKey: ['templatesByCategoryAll', tenantId, storeId]` (no `activeCategoryKey`).
   - **queryFn:** For each entry in `CATEGORY_CONFIG`, call `getTemplatesByCategory` with the same tenantId/storeId and that category’s fetchConfig; run in parallel (e.g. `Promise.all`); return `{ ok: true, byCategory: { [key]: templates } }`.
   - **Options:** `staleTime: 10 * 60 * 1000` (10 min), `refetchOnWindowFocus: false`, `refetchOnMount: false` (or keep default so mount still fetches once).
   - **Why:** Rotation only changes which category is *displayed*; it no longer changes the query key, so no refetch every 20s.

2. **Derive `templatesByCategory` and loading from the “all” query**
   - From `data?.byCategory` (or equivalent) populate `templatesByCategory` in a `useEffect` (or derive in render).
   - Use a single loading flag from the query (`isLoading` / `isFetching`) instead of per-category loading tied to `activeCategoryKey`.

3. **Keep UI rotation logic unchanged**
   - `goToNextCategory`, `activeCategoryKey`, progress bar, and interval (7s / 20s) stay as-is; only the data source for the active category becomes the cached “all” result.

**Risks:** Slightly higher initial load (one batch of 6 category requests) and more memory for cached templates; acceptable. Other pages that use the same component still get correct data; tenantId/storeId stability is addressed in Step 2.

**Deliverable:** File and query options as above.

---

### STEP 2 — Guest session idempotent per tab (tenantId stable)

**Files:**  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/storage.ts` (add sessionStorage key for guest)  
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`

**Storage key (sessionStorage, not localStorage):**

- **Key:** `cardbey_guest_session` (or env-scoped: `cardbey_${ENV}_guest_session`).
- **Value:** JSON `{ userId, tenantId, token, createdAt?: number }`. Optional: `expiresAt` if backend sends TTL (can skip for minimal change).
- **Read:** In `getOrCreateGuestSession()` before checking `globalGuestSessionData`: if `sessionStorage.getItem(guestSessionKey)` exists and has valid token/userId, parse and return it (and optionally sync to `globalGuestSessionData` and bearer/adminToken if missing).
- **Write:** After successful POST /api/auth/guest in quickStart: write to sessionStorage. In FeaturesPage after successful guest creation: write to sessionStorage (if we keep a direct POST there) and ensure token is also set via setAuthToken so useCurrentUser sees it.

**quickStart.ts edits:**

1. **Persist guest to sessionStorage after successful POST /api/auth/guest**
   - In the `.then()` that sets `globalGuestSessionData`, also `sessionStorage.setItem(guestSessionKey, JSON.stringify({ userId, tenantId, token, createdAt: Date.now() }))`.
   - Add a helper e.g. `getGuestSessionFromStorage()` that reads and parses; if present and has token/userId, return it (and optionally sync to localStorage bearer/adminToken if not set).

2. **At top of getOrCreateGuestSession(): prefer sessionStorage guest**
   - If sessionStorage has a valid guest session (has token and userId), use it: set `globalGuestSessionData` from it, ensure bearer/adminToken in localStorage (so useCurrentUser and API see it), then return the same shape. Do not call POST /api/auth/guest again.

3. **Keep singleton in-flight promise**
   - Already present: `globalGuestSessionPromise`; keep reusing it so concurrent callers don’t create multiple guests.

4. **Do not clear guest on unrelated 401**
   - No change in api.ts (already does not clear tokens on 401). No new 401 handler that clears sessionStorage guest.

**FeaturesPage.tsx edits:**

1. **ensureGuestSession: run once when unauthenticated**
   - Before calling POST /api/auth/guest, check sessionStorage for existing guest; if valid, set token (setAuthToken) and dispatch authchange, then return (no POST).
   - Use a ref e.g. `guestCheckDoneRef` so we don’t re-run the “create guest” path repeatedly if effect runs again (e.g. due to user?.id flicker); only create if no token and no sessionStorage guest.

2. **Prefer quickStart.getOrCreateGuestSession() in FeaturesPage**
   - Replace direct apiPOST('/api/auth/guest') with `getOrCreateGuestSession()` from quickStart so one code path and sessionStorage + in-memory cache apply. Then store token and dispatch authchange from that result.

**Dev-only logging:**

- When guest is created (POST): `console.log('[Guest] Created once:', { tenantId })`.
- When guest is reused from sessionStorage: `console.log('[Guest] Reused from session:', { tenantId })`.
- In FeaturesPage, when ensureGuestSession runs and skips (token or session exists): log once.

**Risks:** If backend invalidates guest tokens quickly, reusing session guest might yield 401 on subsequent calls; mitigate by reusing only within same tab/session and not clearing on unrelated 401. Logout should clear sessionStorage guest (clearTokens already clears localStorage; add sessionStorage removeItem for guest key in clearTokens or on explicit logout).

**Deliverable:** Storage key `cardbey_guest_session` (or env-scoped); read in getOrCreateGuestSession and FeaturesPage ensureGuestSession; write in quickStart after POST and in FeaturesPage when creating via getOrCreateGuestSession.

---

### STEP 3 — SSE: stabilize connection (no unnecessary close/reopen)

**Files:**  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts`  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/sse.ts`

**Reconnect triggers today:**

- **sse.ts attachLifecycle:** On `visibilitychange` (tab visible) and `online`, calls `reconnectSSE()` (which is sseClient `reconnect()`). It uses `getSSE()` to decide: “if !es || es.readyState === EventSource.CLOSED” then reconnect. But `getSSE()` returns `es` only when `readyState === OPEN`; when CONNECTING it returns null, so we incorrectly reconnect and call `cleanupEventSource()`, aborting a connecting connection.
- **sseClient reconnect():** Always calls `cleanupEventSource()` then `connect()`, so it closes any existing connection (including CONNECTING).

**Edits:**

1. **sseClient.ts – Export “is connection truly closed?”**
   - Add `export function isConnectionClosed(): boolean` returning `!es || es.readyState === EventSource.CLOSED`. Do not treat CONNECTING as “closed”.

2. **sse.ts – attachLifecycle: reconnect only when connection is truly closed**
   - Replace the condition that uses `getSSE()` with: call `isConnectionClosed()` from sseClient. Only call `reconnectSSE()` when `isConnectionClosed()` is true. So when CONNECTING or OPEN we do nothing.

3. **sseClient.ts – reconnect(): only cleanup if there is something to clean**
   - At the start of `reconnect()`, if `es && es.readyState === EventSource.OPEN`, return early (already present). If `es && es.readyState === EventSource.CONNECTING`, also return early (do not close a connecting connection). Only call `cleanupEventSource()` when `es` is non-null (and then proceed to connect()).

**Result:** Reconnect runs only when the connection is actually CLOSED (or null). No proactive close on visibility/online; cleanup only on full app shutdown (beforeunload/pagehide) or explicit reconnect after CLOSED.

**Risks:** If the connection is dead but not yet CLOSED (e.g. server died, no heartbeat), we might not reconnect until the browser marks it CLOSED. Acceptable for this change; optional follow-up could add a heartbeat.

**Deliverable:** Reconnect triggers: only when `isConnectionClosed()` is true (visibility/online in attachLifecycle); and in reconnect() only when not OPEN and not CONNECTING.

---

### Manual test checklist

- **A) /features for 2 minutes**
  - templates/suggestions do NOT refetch every 20s (network: no repeated GET every 20s).
  - tenantId in templates calls stays constant (same guest_xxx).
  - /api/auth/guest fires at most once per tab (and once per new tab if no session).
- **B) SSE**
  - Only one “Client connected” (or equivalent) per tab; no repeating connect/disconnect loops while idle.
- **C) Regression**
  - QuickStart (start store from /features) still works.
  - Logout and login still work.
  - Other routes that load templates still work (e.g. content studio if it uses similar API).

---

### Guardrails (unchanged)

- Store creation publish flow: no changes to publish or draft review.
- MagicMomentOverlay / job streams: no changes to useJobPoll or job-specific SSE.
- Authenticated users: guest path only when no token; user?.id flow unchanged.
- /api/v2/flags: no change in this PR (already one-time/long cached).

---

## 2) IMPLEMENTATION (code) – DONE

- **STEP 1:** `TemplateCategorySlider.tsx` – Replaced single-category useQuery with one query keyed by `['templatesByCategoryAll', tenantId, storeId]`; queryFn fetches all categories in parallel and returns `{ ok, byCategory }`; `staleTime: 10 * 60 * 1000`, `refetchOnWindowFocus: false`. Rotation no longer changes query key.
- **STEP 2:** `storage.ts` – Added `storageKeys.guestSession`; `clearTokens()` now also removes `sessionStorage` guest. `quickStart.ts` – Prefer sessionStorage guest in `getOrCreateGuestSession()`, write guest to sessionStorage after successful POST; dev log `[Guest] Reused from session:` / `[Guest] Created once`. `FeaturesPage.tsx` – Uses `getOrCreateGuestSession()` and `guestCheckDoneRef` so ensure runs once when unauthenticated.
- **STEP 3:** `sseClient.ts` – Added `isConnectionClosed()`; `reconnect()` returns early when `readyState === CONNECTING`. `sse.ts` – attachLifecycle uses `isConnectionClosed()` instead of getSSE() so we only reconnect when connection is truly closed.

---

## 3) Post-change verification notes (what to watch in logs/network)

- **Network (DevTools):**
  - On /features: after initial load, no GET `/api/mi/orchestra/templates/suggestions` every 20s; at most one batch on load (several parallel requests for categories), then silence until 10 min stale or refetch.
  - POST `/api/auth/guest`: at most one per tab open of /features; same tab refresh may reuse sessionStorage guest (no second POST).
  - GET `/api/stream?key=admin`: one request that stays open (pending); no repeated “pending → aborted → pending” every 20s.
- **Console (dev, optional `localStorage.setItem('cardbey.debug', 'true')`):**
  - `[Guest] Created once:` on first guest create; `[Guest] Reused from session:` when sessionStorage guest is used; tenantId stable across requests.
  - `[SSE] Reconnect skipped - connection is already open` or `... still connecting` when tab becomes visible (no unnecessary reconnect).
- **Backend logs:**
  - No repeated “req.aborted (client closed)” for `/api/stream` while the tab is idle on /features.
