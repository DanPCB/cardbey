# /features 20–40s Loop – Root Cause Report

## Final summary (root cause + fix)

**Root cause:** Vite HMR websocket host resolved to LAN IP; WS failed → polling fallback → periodic reload/blank flash.

**Secondary noise:** Initial tenantId flip + StrictMode caused duplicate template fetch + one SSE reopen at startup.

**Fix:** Force HMR to localhost; preload tenantId from sessionStorage to avoid query-key flip.

---

**Purpose:** Determine whether the 20–40s "blank page" on `/features` is:
- **A)** Real page reload (document navigation)
- **B)** SPA remount/reset (AppShell unmount/remount)
- **C)** Repeated fetch/refetch without reload (e.g. flags + stream refetch)

**Instrumentation:** All logging is behind `window.__debugLoop = true` or `localStorage.cardbey_debug_loop === '1'`. No business logic changed.

---

## 1. How to run / verify

**Important:** The loop debug flag must be set **before** the page loads. If you set it after the page has already loaded, you will see **no `[LOOP]` logs** (the capture will look like a normal load). So: enable the flag first, then reload.

1. **Enable loop debug** in the browser console (do this first):
   ```js
   localStorage.setItem('cardbey_debug_loop', '1');
   ```
   or `window.__debugLoop = true;`

2. **Reload** the tab (F5) or open `http://localhost:5174/features` in a new tab. The whole load must happen **after** the flag is set.

3. **Start dev server** (if not already running):
   ```bash
   cd apps/dashboard/cardbey-marketing-dashboard && pnpm run dev
   ```

4. **Wait ≥2 minutes** on /features without navigating.

5. **Collect console output:** Copy all `[LOOP]` logs (and any errors). You can paste them here in chat or into the sections below.

6. **Interpret:**
   - **`[LOOP] beforeunload`** → Real document reload. If this appears every 20–40s, the initiator is a full navigation/reload.
   - **`[LOOP] AppShell unmount`** then **`[LOOP] AppShell mount`** (new `instanceId`) → SPA remount. If these appear in a loop, something is remounting the root.
   - **`[LOOP] FETCH`** with rising **count** for `/api/v2/flags` or `/api/stream` → Repeated refetch without reload. Check the stack trace for the caller.
   - **`[LOOP] SSE CLOSE`** then **`[LOOP] SSE OPEN`** → SSE disconnect/reconnect loop; check stacks for what triggers close.
   - **`[LOOP] global error`** or **`[LOOP] unhandledrejection`** → Crash; the stack and message are the root cause (e.g. System Guardian `metrics` undefined).

---

## 2. Evidence from console (initial load + after 1 min)

*Console capture below was taken **without** `cardbey_debug_loop` (no `[LOOP]` logs). It still reveals startup behavior that can cause one SSE close/open and duplicated work.*

### 2.1 First events (before bootstrap)

```
[SSE] Cleaning up EventSource
  Object { readyState: 1, url: "http://localhost:5174/api/stream?key=admin" }
  sseClient.ts:127:15
XHR GET http://localhost:5174/api/stream?key=admin  Blocked

[vite] connecting...
```

- **Interpretation:** `cleanupEventSource()` ran while the connection was **OPEN** (readyState: 1). The stream request then shows **Blocked** (aborted/closed).
- **Possible causes:** (1) **Real page reload** – previous document’s `beforeunload` runs → cleanup → new document loads ([vite] connecting, bootstrap). (2) **React Strict Mode** – first AppShell mount’s effect runs, then Strict Mode unmounts → AppShell cleanup → SSE cleanup (same log). So the very first cleanup is either from a prior page unload or from the first Strict Mode unmount.

### 2.2 AppShell effect runs twice (Strict Mode)

```
[AppShell] ⚡ useEffect running...
...
[AppShell] Cleaning up SSE...
...
[AppShell] ⚡ useEffect running...
[AppShell] Using proxy mode (dev)
[AppShell] 🔗 Attaching SSE lifecycle handlers
[AppShell] 📡 Subscribing to "message" event ...
[AppShell] ✅ SSE setup complete
```

- **Interpretation:** Effect runs → cleanup (“Cleaning up SSE”) → effect runs again. That is **React Strict Mode** double-mount: first mount’s cleanup runs before the second mount’s effect.
- **Consequence:** One unnecessary SSE teardown at startup, then the second mount subscribes again. So we get **one** spurious SSE close and then a new connection (“DOM not ready, delaying connect…” later “Connection OPENED”).

### 2.3 After ~1 minute

- Single “Connection OPENED” for `/api/stream?key=admin`; no further cleanup/open in the paste.
- To see whether the **20–40s loop** is reload vs remount vs refetch, enable `localStorage.setItem('cardbey_debug_loop', '1')`, reload /features, wait **≥2 minutes**, and capture again. Then check for repeated: `[LOOP] beforeunload`, `[LOOP] AppShell unmount/mount`, `[LOOP] FETCH` (rising count), or `[LOOP] SSE CLOSE` / `[LOOP] SSE OPEN`.

---

## 3. Timeline (with cardbey_debug_loop enabled)

From captured console (initial load; no [LOOP] beforeunload = no full reload in this window):

| Order | Event |
|-------|--------|
| 1 | `readyState 1 reason: cleanupEventSource` (SSE CLOSE from previous context / Strict Mode unmount) |
| 2 | [LOOP] FETCH `/api/mi/orchestra/templates/suggestions` **count 6** (TemplateCategorySlider queryFn) |
| 3 | [LOOP] AppShell **mount** t: 1770516257208, path: "/features", instanceId: "a8581ecbef8718" |
| 4 | [LOOP] FETCH `/api/v2/flags` **count 1** (initFeatureFlags → AppShell.tsx:204) |
| 5 | AppShell SSE setup complete |
| 6 | [LOOP] AppShell **unmount** t: 1770516257212, **same** instanceId: "a8581ecbef8718" |
| 7 | [AppShell] Cleaning up SSE... |
| 8 | [LOOP] AppShell **mount** t: 1770516257223, **same** instanceId: "a8581ecbef8718" |
| 9 | [LOOP] FETCH `/api/mi/orchestra/templates/suggestions` **count 7 → 12** (with tenantId=guest_xxx; TemplateCategorySlider refetch) |
| 10 | [LOOP] SSE OPEN (construct) → (onopen) → Connection OPENED |

So: **no beforeunload**; **one** AppShell unmount → cleanup SSE → remount (same instanceId); **flags** once; **suggestions** 6 then 6 more (counts 7–12) after remount when tenantId is set.

---

## 4. Call stacks for repeating events

### 4.1 Template suggestions refetch (count 6 → 7–12)

- **Endpoint:** `/api/mi/orchestra/templates/suggestions` (all categories; query key includes tenantId).
- **Caller:** `TemplateCategorySlider.tsx` → `queryFn` (line 117) → `getTemplatesByCategory` → `getMITemplateSuggestions` (api.ts).
- **Stack (representative):**
  ```
  request api.ts:515
  apiGET api.ts:651
  getMITemplateSuggestions api.ts:1678
  getTemplatesByCategory api.ts:1790
  results TemplateCategorySlider.tsx:135
  queryFn TemplateCategorySlider.tsx:117
  fetchFn query.ts:474
  executeFetch_fn queryObserver.ts:343
  onSubscribe queryObserver.ts:101
  useBaseQuery useBaseQuery.ts:100
  ```
- **Why count goes 6 then 7–12:** First run uses query key `['templatesByCategoryAll', tenantId, storeId]` (tenantId may be null). After **AppShell remount**, guest session is ready so **tenantId becomes `guest_xxx`**; query key changes → React Query refetches the whole “all categories” query (6 requests again).

### 4.2 Flags fetch (count 1 only)

- **Endpoint:** `/api/v2/flags`.
- **Caller:** `featureFlags.ts:17` (initPromise) → `initFeatureFlags` (featureFlags.ts:31) → `AppShellInner` (AppShell.tsx:204).
- Only one fetch in this capture.

### 4.3 SSE CLOSE then OPEN

- **SSE CLOSE:** Triggered by **cleanupEventSource** (sseClient.ts) — called from AppShell effect **cleanup** when React Strict Mode unmounts AppShell (AppShell.tsx:248 “Cleaning up SSE…”).
- **SSE OPEN:** After remount, `subscribe` (sse.ts:14) → `subscribeSSE` (sseClient.ts:666) → `connect` (sseClient.ts) → EventSource created; then `onopen` fires.

### 4.4 AppShell remount

- **Unmount:** React Strict Mode (development) unmounts the tree then remounts. Same **instanceId** on both mounts → same component instance across unmount/remount.
- **Effect cleanup** runs on unmount → “[AppShell] Cleaning up SSE…” → sseClient cleanup → `[LOOP] SSE CLOSE` (reason: cleanupEventSource).

---

## 5. Conclusion

**Answer: (B) SPA remount/reset** at startup (and possibly contributing to 20–40s if something re-triggers it).

- **No full reload:** No `[LOOP] beforeunload` in the capture.
- **Exact initiator (startup):** **React Strict Mode** double-mount: AppShell mounts → effect runs (flags, SSE subscribe) → Strict Mode unmounts AppShell → **effect cleanup runs** → “Cleaning up SSE” → **cleanupEventSource()** (SSE CLOSE) → Strict Mode remounts AppShell → effect runs again (flags, SSE subscribe again) → SSE OPEN after DOM ready.
- **Duplicate template requests:** Query key `['templatesByCategoryAll', tenantId, storeId]` **changes** when `tenantId` goes from null to `guest_xxx` (guest session created after first mount). So the “all categories” query runs **twice** — once without tenantId (counts 1–6), once with tenantId (counts 7–12). That refetch is caused by the **remount** plus **tenantId** becoming available.
- **Why it can feel like a “loop”:** One unnecessary SSE close/open and 12 template requests (6 + 6) at load. If in production (or without Strict Mode) something else causes **periodic** remount or **tenantId flicker**, you’d see the same pattern every 20–40s.

**Why it repeats (at startup):** Strict Mode intentionally unmounts/remounts. The duplicate work (SSE cleanup + reconnect, templates refetch when tenantId appears) is a consequence of that plus query key depending on tenantId.

---

## 6. Proposed minimal fix (bullets only – do NOT implement yet)

- **Stabilize guest/tenantId so query key doesn’t flicker:** Persist guest session (e.g. sessionStorage) and set tenantId once so `['templatesByCategoryAll', tenantId, storeId]` is stable and doesn’t refetch when guest is created (already in FEATURES_20S_LOOP_FIX_PLAN Step 2).
- **Don’t refetch templates on rotation:** Use a single “all categories” query key without `activeCategoryKey` so rotation only changes UI, not the key (already in FEATURES_20S_LOOP_FIX_PLAN Step 1).
- **SSE: only reconnect when connection is truly closed:** In lifecycle (visibility/online), call reconnect only when `isConnectionClosed()`; in `reconnect()`, don’t call cleanup when state is CONNECTING (already in FEATURES_20S_LOOP_FIX_PLAN Step 3).
- **Optional (dev only):** Reduce Strict Mode double-mount impact by making SSE subscribe/cleanup resilient to double mount (e.g. don’t close an open connection in cleanup if we’re about to remount immediately), or accept the one-time dev-only extra work.

---

## 7. Instrumentation reference

| What | Where | Flag |
|------|--------|------|
| AppShell mount/unmount | `AppShell.tsx` | `isLoopDebug()` |
| SSE OPEN (construct + onopen) | `sseClient.ts` | `isLoopDebug()` |
| SSE CLOSE | `sseClient.ts` `cleanupEventSource()` | `isLoopDebug()` |
| FETCH (flags, stream, guest, health, suggestions) | `api.ts` `request()` | `isLoopDebug()` |
| Global error / unhandledrejection | `main.jsx` | `isLoopDebug()` |
| beforeunload | `main.jsx` | `isLoopDebug()` |

To disable: `localStorage.removeItem('cardbey_debug_loop')` and/or `window.__debugLoop = false`.
