# Bootstrap 20s loop – FINDINGS, ROOT CAUSE, PROPOSAL (no code)

## 1) FINDINGS

### Step 1 — The “one running path”

| Item | Location |
|------|----------|
| **Page route** | `path="/features"` → **FeaturesPage** (`src/pages/public/FeaturesPage.tsx`) |
| **Layout/provider** | App wraps all routes with **QueryClientProvider**, **ThemeProvider**, **DraftModeProvider**; **AppShell** wraps content and runs **initFeatureFlags()** + **SSE** (subscribe + attachLifecycle) in a single `useEffect([])`. FeaturesPage uses **MarketingLayout** and mounts **TemplateCategorySlider**, **MagicMomentOverlay**, **QuickStartProgress**. |
| **MI widget** | **MagicMomentOverlay** is mounted on FeaturesPage (for job progress). It uses **useJobPoll** (job-specific SSE + polling), not the global admin stream. |

So the loop is tied to the **/features** route: FeaturesPage + TemplateCategorySlider + AppShell’s init/SSE.

---

### Step 2 — Call graph and conditions for guest auth

| Caller | File | Trigger | When it runs |
|--------|------|--------|----------------|
| **POST /api/auth/guest** | `FeaturesPage.tsx` | `ensureGuestSession()` inside `useEffect(..., [user?.id])` | On mount and whenever `user?.id` becomes falsy (e.g. no user yet or useCurrentUser returns null). |
| **POST /api/auth/guest** | `FeaturesPage.tsx` | `handleRetryAsGuest()` | Only when user clicks “Retry as guest” (not on a timer). |
| **POST /api/auth/guest** | `quickStart.ts` | `getOrCreateGuestSession()` | Called from `ensureAuth()` when no bearer/adminToken; and from `runQuickStartFlow` when GET /auth/me returns 401 (then creates guest and stores token). |
| **POST /api/auth/guest** | `quickStart.ts` | `runQuickStartFlow` (inside try/catch after 401 on /auth/me) | When starting a quick-start job and /auth/me fails. |

**No 20s timer found for guest:** No `setInterval`/`setTimeout` with 20000/20_000 targets auth/guest. The only **20s** value in this flow is **TemplateCategorySlider**: `PASSIVE_AUTO_ROTATE_INTERVAL_MS = 20000` — used to advance the **category** (UI) when the slider is out of view, not to call guest.

**Token clearing:** `clearTokens()` exists (api.ts, Sidebar, login, Environment) but is only used on explicit logout, not on 401. **api.ts does not clear tokens on 401**; it only throws.

**Refetch/invalidation:** `useCurrentUser` has `staleTime: 60_000`, `refetchOnWindowFocus: false`. `invalidateQueries({ queryKey: ['currentUser'] })` is used in quickStart (after creating guest), DashboardEnhanced (on dismiss welcome), AccountProfilePage, WelcomeCreateStore — none on a 20s interval on /features.

**Conclusion:** Guest is recreated when something causes **no token** to be present at the time `ensureGuestSession` or `getOrCreateGuestSession` runs. Plausible causes: (1) **Race:** token not yet written when another part of the app (e.g. TemplateCategorySlider’s useQuery) or a refetch runs and triggers a path that assumes auth. (2) **Repeated mount:** a parent or key change causes FeaturesPage (or a subtree that runs guest logic) to unmount/remount, so the “no token” path runs again. (3) **Backend 401:** if /auth/me or another call returns 401 and some path interprets that as “no session” and calls guest again without re-checking token. Changing **tenantId** (guest_8ff → guest_dbd) implies **a new guest is created** (new POST /api/auth/guest), so the same trigger must be causing “create guest” to run again.

---

### Step 3 — SSE `req.aborted` (client closed) loop

| Item | Location | Behavior |
|------|----------|----------|
| **EventSource creation** | `sseClient.ts`: `connect()` creates `es = new EventSource(absoluteUrl)`. URL from `getUrl()` → `/api/stream?key=admin` (or key from `tokens.apiKey`). |
| **Who calls connect** | First **subscribe()** (e.g. AppShell’s `subscribe('message', handler, 'key=admin')`) schedules `connect()` after 10ms if no existing connection. |
| **When SSE is closed** | (1) **cleanupEventSource()** — called on `beforeunload`/`pagehide`, or at the start of **reconnect()** (which then calls `connect()` again). (2) **Reconnect** is triggered from **sse.ts** `attachLifecycle()` when `visibilitychange` (tab visible) or `online` and `es.readyState === EventSource.CLOSED`. (3) **onerror** in sseClient when `readyState === CLOSED`: after a delay, `connectAttempted = false` and `setTimeout(..., connect)`. |
| **Effect deps** | AppShell’s effect has deps `[]`; it runs once per AppShell mount. No 20s in AppShell. |

So **SSE is closed by the client** when: (a) **reconnect()** runs (visibility/online and connection was CLOSED), or (b) **connect()** runs again and cleans up the previous `es` before creating a new one. If the **server** closes the stream (e.g. keepalive/timeout), the browser sets the EventSource to CLOSED; then **onerror** runs and, after backoff, we call **connect()** again, which calls **cleanupEventSource()** (close) then creates a new EventSource. So every time we “reconnect”, the backend sees one connection close (req.aborted / client closed) and then a new GET /api/stream. The **~20s** could be: server closing the stream on a timeout, or a client-side timer/visibility effect that causes reconnect every ~20s.

---

### FINDINGS table (Endpoint → file/hook → trigger → cadence → why on this route)

| Endpoint | File / hook | Trigger | Cadence | Why only on this route |
|----------|-------------|---------|---------|-------------------------|
| **POST /api/auth/guest** | FeaturesPage `ensureGuestSession` (useEffect [user?.id]) | Mount or `user?.id` falsy | Once per “no user” state; repeats if something keeps resetting user/token | Only FeaturesPage runs this auto-guest effect on a public page. |
| **GET /api/auth/me** | useCurrentUser (user.ts) | Query enabled when `stableHasToken`; also after invalidateQueries(['currentUser']) | On mount when token exists; 60s stale, no refetch interval | Runs on any page using useCurrentUser; FeaturesPage uses it. |
| **GET /api/v2/flags** | initFeatureFlags() from AppShell | AppShell useEffect [] | Once per AppShell mount | AppShell wraps app; if AppShell remounts (e.g. parent key), flags run again. |
| **GET /api/mi/health** | FeaturesPage `checkCoreHealth` | useEffect [] | Once per FeaturesPage mount | Only FeaturesPage has this health check on mount. |
| **GET /api/mi/orchestra/templates/suggestions** | TemplateCategorySlider useQuery | queryKey includes `activeCategoryKey`, `tenantId`, `storeId` | Refetch when category or tenantId/storeId changes; **category changes every 20s** when slider out of view (PASSIVE_AUTO_ROTATE_INTERVAL_MS) | TemplateCategorySlider is only on FeaturesPage (and possibly similar marketing pages). |
| **GET /api/stream?key=admin** | sseClient.connect() | First subscribe (AppShell) or reconnect (visibility/online or after onerror) | Once on subscribe; then reconnect on visibility/online if CLOSED, or after server close + backoff | AppShell subscribes once; reconnect can run on any tab focus if connection was closed. |

So the **~20s** cadence aligns with **TemplateCategorySlider**’s passive rotation (20s) driving **templates/suggestions** refetches. The **full burst** (guest, auth/me, flags, health, templates, stream) would occur together if something causes **remount or re-init** of the tree that runs these (e.g. FeaturesPage or AppShell or a parent with a changing key) on a similar cadence, or if **visibility/online** plus a closed SSE triggers reconnect while other inits re-run.

---

## 2) ROOT CAUSE (1–2 paragraphs)

**Summary:** The ~20s bootstrap burst is likely a combination of (1) **TemplateCategorySlider** rotating category every **20s** when out of view, refetching **templates/suggestions** with the current **tenantId**; (2) **guest identity churn**: a new guest (and thus new tenantId) is created repeatedly because guest creation is **not idempotent per tab** — either a race (token not yet stored before another code path checks “no auth”), or a path that calls `getOrCreateGuestSession`/`ensureAuth` without reusing an existing valid guest from storage, so each “bootstrap” creates a new guest (guest_8ff, then guest_dbd, …); (3) **SSE** is closed and reopened (client-side cleanup + new EventSource) when the connection goes CLOSED (server timeout or error) and reconnect runs (visibility/online or onerror backoff), so the backend sees **GET /api/stream** then **req.aborted (client closed)** in a loop. So: **guest is recreated** (causing new tenantId and thus changing templates/suggestions param and possibly re-triggering auth/me/flags/health), and **SSE is recreated** on reconnect instead of being reused, both contributing to the noisy 20s burst.

---

## 3) PROPOSAL (minimal change set, risks, manual test checklist)

### A) Make guest auth idempotent per tab

- **Persist guest in sessionStorage** (e.g. `guest_tenantId` + `guest_token` or a single `guest_session` object) keyed by a stable tab/session id if needed.
- **Reuse that guest** when it exists and token is still present: before calling POST /api/auth/guest, check sessionStorage; if a valid guest token exists for this tab/session, use it (set in memory/localStorage as needed) and **do not** call POST /api/auth/guest again.
- **Dedupe in-flight:** keep a **singleton promise** for “get or create guest” (quickStart already has `globalGuestSessionPromise` but clears it after resolve; ensure we **reuse the same resolved guest** from storage when available so we don’t create a new one on the next call).
- **Do not clear guest on unrelated 401:** ensure no global handler clears tokens (or guest session) on 401 for endpoints that are not “session invalid” (e.g. do not clear on 401 from templates/suggestions or mi/health). If any such handler exists, remove or narrow it to only logout/session endpoints.

**Risks:** If backend invalidates guest tokens aggressively, reusing a cached guest could leave the user in a bad state until the next explicit action; mitigate by reusing only for the same tab/session and optionally validating with a single GET /auth/me when reusing.

---

### B) Stop bootstrap refetches from repeating

- **/api/v2/flags:** Fetch **once** per app load (initFeatureFlags already does “if (initialized) return”). Ensure it is not re-run by remounts (e.g. call from a true singleton or from a provider that does not remount). **Long cache** (e.g. session or 5+ min); **no refetchInterval**.
- **/api/mi/health:** Call **on-demand** only when MI UI is visible or when needed (e.g. before starting a job), not on every FeaturesPage mount. **Cache** result for a short TTL (e.g. 60s) so multiple components don’t each hit it.
- **Templates/suggestions:** Keep React Query but ensure **tenantId** is stable (same guest not recreated). Optionally **do not** refetch templates on **every** category rotation when slider is out of view; e.g. refetch only when category changes due to **user** interaction, or throttle passive rotation refetches (e.g. no refetch if data is still fresh).

**Risks:** Slightly staler flags/health; acceptable if flags/health are not critical every 20s on /features.

---

### C) SSE: single connection, reuse, close only on shutdown

- **One EventSource per key (e.g. `admin`):** Reuse the same connection; do **not** close and recreate on route change or when dependencies of a hook change. Only **close** on full app unload (beforeunload/pagehide) or explicit disconnect.
- **Reconnect only when truly disconnected:** If `readyState === CLOSED`, reconnect once; avoid re-running “connect” on every visibility/online if the connection is already OPEN or CONNECTING.
- **Key for public/guest:** Ensure SSE key matches tenant/auth when required by backend; do not default to `admin` for guest flows if the backend expects a different key (optional, only if backend requires it).

**Risks:** If we never close, a long-lived tab might hold a stale connection after backend restart; mitigate with existing onerror/reconnect when CLOSED, but without closing the connection from our side on visibility/route changes.

---

### D) Manual test checklist

1. **One guest per tab:** Open /features in one tab; in network, confirm **one** POST /api/auth/guest and **one** GET /auth/me; wait 60+ seconds; confirm **no** second POST /api/auth/guest and **no** change of tenantId in subsequent requests.
2. **No 20s burst:** Stay on /features with slider visible or out of view for 2+ minutes; confirm **no** repeated burst (guest, auth/me, flags, mi/health, templates, stream) every ~20s.
3. **SSE stable:** After initial GET /api/stream?key=admin, confirm **one** connection; no repeated “connect then disconnect (req.aborted)” every ~20s in backend logs.
4. **Templates tenantId stable:** In GET /api/mi/orchestra/templates/suggestions, confirm **same** tenantId (e.g. guest_xxx) across multiple requests; no flip to a different guest_yyy.
5. **Store creation flow:** From /features, start a store (form/voice/url/template); confirm Draft Review → Publish Review → Publish → Public preview still works and MI streaming is unchanged.
6. **Logout/login:** Logout and open /features again; confirm a new guest can be created and used as expected.

---

## 4) IMPLEMENTATION

**Not written yet.** Implementation will follow only after approval of this FINDINGS + ROOT CAUSE + PROPOSAL.
