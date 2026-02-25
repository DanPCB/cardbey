# Frontscreen ~20–60s Reload: Root Cause and Fix

## LOCKED RULE

No change may break: store creation, publish, preview, /frontscreen store reels, /frontscreen?mode=slides, auth, or SSE. All fixes are minimal and additive.

---

## STEP 1 — Exact Reload Trigger (Root Cause)

### Evidence

- Console shows **real full page reload**: UNLOAD → beforeunload → pagehide(persisted:false) → [vite] connecting… → BOOT → App rendered successfully.
- After each reload: /api/v2/flags, /api/auth/me, /api/public/stores/feed are re-fetched.
- Stack trace (when `cardbey_debug_loop` is enabled) shows a **60s-ish setTimeout** scheduled from **SetCoreUrl.tsx:61**.

### Findings

1. **SetCoreUrl does NOT trigger reload.**  
   Line 61 is `setTimeout(() => setVisible(false), 60_000)`. The callback only hides the floating “Set Core URL” button. There is no `location.reload()`, `location.href`, or navigation in SetCoreUrl. The stack trace only identifies **who scheduled** a 45–75s timer; the callback does not cause a full reload.

2. **No app code calls reload on a timer.**  
   Grep for `location.reload` / `window.location.reload` shows only: error-overlay button (user click), store draft/review flows (user action), dev panels (user click). None run on a 20–60s interval.

3. **Actual cause: Vite HMR full-page reload.**  
   When the HMR WebSocket disconnects or the liveness check fails, the **Vite client** can perform a full page reload. In Vite 5 this happened on HTTP 4xx/5xx from the ping; Vite 6 (PR #17891) fixed this by using WebSocket for liveness. The project was upgraded to Vite 6 to stop this.

4. **Chain (what the stack trace actually means):**  
   SetCoreUrl mounts → schedules a **one-shot** 60s timer (to fade the button) → [LOOP] hook logs “setTimeout scheduled (60s-ish)” and stack points at SetCoreUrl. When the **page** later reloads (due to Vite HMR or another cause), it is **not** because that timer fired and called reload; it is because the Vite client decided to reload (or another external trigger). So: **SetCoreUrl timer → setVisible(false) only. Reload is from Vite HMR (or WS disconnect), not from SetCoreUrl.**

---

## STEP 2 — SetCoreUrl Guardrails (Implemented)

- **No long timer in dev.**  
  The 60s auto-fade timer is **skipped in DEV** so no 45–75s timer is scheduled from SetCoreUrl in development. This removes SetCoreUrl from [LOOP] stack traces and eliminates any possibility of that callback contributing to reload.  
  - In production the timer still runs and is cleaned up: `return () => clearTimeout(timer)`.

- **No automatic reload on Core URL change.**  
  SetCoreUrl already does not call `location.reload()` when the user saves a new Core URL; it dispatches `cardbey:coreUrlChanged` and listeners update in-memory config or reconnect SSE. No change made here.

- **Idempotency.**  
  The “when modal opens” effect still runs every time `open` becomes true so the modal always shows current mode/URL. No “run once per session” guard was added there so reopening the modal continues to work.

**Files:** `apps/dashboard/cardbey-marketing-dashboard/src/components/SetCoreUrl.tsx`  
**Key change:** In the effect that schedules the 60s fade, added `if (import.meta.env.DEV) return;` so the timer is never scheduled in dev.

---

## STEP 3 — Flags (/api/v2/flags)

- **Already once per page load.**  
  `initFeatureFlags()` in `featureFlags.ts` uses a per-document guard (`window.__cardbey_flags_init`) and a single `initPromise`. AppShell calls it once; remounts reuse the same promise. No React Query, no refetchInterval, no 20s polling.

- **No code change.**  
  Acceptance: /api/v2/flags is requested once per page load, not every 20s (after a full reload it will run again once, which is expected).

---

## STEP 4 — SSE Gate

- **Global admin SSE is already gated.**  
  In `AppShell.tsx`, the effect that configures and subscribes to the global SSE client returns early when `pathname.startsWith("/frontscreen")`, so **no** `/api/stream?key=admin` is opened on /frontscreen (store reels) or /frontscreen/*.

- **Slides mode.**  
  For /frontscreen?mode=slides, the slides UI (e.g. BackgroundFeed) mounts and opens its own EventSource. That is the only place that should open the stream in slides mode. AppShell does not start SSE for any /frontscreen path.

- **Backend.**  
  Core already sends SSE keepalive every 15s (`res.write(':\n\n')` + flush). Frontend sseClient uses a singleton EventSource, cleanup on beforeunload, and reconnect cooldown; no reload on error.

- **No code change.**  
  Acceptance: /frontscreen (reels) has zero /api/stream requests; /frontscreen?mode=slides has one stable EventSource when the slides view is active.

---

## STEP 5 — Verification Checklist

| Check | Expected |
|-------|--------|
| Open /frontscreen, idle 3 min | No reload; no repeated beforeunload/pagehide; no repeated /api/v2/flags. |
| Open /frontscreen?mode=slides, idle 3 min | No reload; one GET /api/stream?key=admin (pending), no reconnect loop. |
| Open LAN URL http://&lt;LAN-IP&gt;:5174/frontscreen, idle 3 min | Same as localhost: no reload, no flag/stream loop. |

**If reloads persist:** Ensure Vite 6 is in use (`pnpm install`, then `npx vite --version` shows 6.x). Restart the dev server and test again. If still occurring, check browser console for “[vite] …” messages and Network tab for HMR WebSocket status.

---

## Summary

- **Root cause:** Full page reload is triggered by the **Vite HMR client** (e.g. after WS disconnect or failed liveness check), not by SetCoreUrl’s 60s timer. The stack trace only showed who scheduled a 60s timer; that timer’s callback does not call reload.
- **Code changes:** (1) SetCoreUrl: do not schedule the 60s auto-fade timer in DEV. (2) Vite upgraded to 6 (already done in a prior change) to reduce HMR-triggered reloads.
- **Unchanged:** Flags (already once per load), SSE gate (already no stream on /frontscreen reels), auth, proxy, store creation, publish, preview.

---

## Detecting the refresh (debug log)

To confirm that full page reloads are happening and how often:

1. **Enable the reload detector** (dev only):  
   `localStorage.setItem('cardbey_debug_reload', '1');` then refresh once.
2. Leave the tab on e.g. `/frontscreen` and watch the console.
3. You will see:
   - **`[RELOAD] boot #1 at <timestamp> (first load)`** — first load.
   - If the page reloads again (e.g. after ~20–60s): **`[RELOAD] beforeunload — document unloading (next load will be boot #2)`**, then **`[RELOAD] boot #2 at <timestamp> (Xs since last boot)`**.
   - So **boot #2, #3, …** and **"Xs since last boot"** mean a full reload occurred; the seconds value is the reload interval.
4. **Disable when done:** `localStorage.removeItem('cardbey_debug_reload');`

The counter is per tab (sessionStorage). Closing the tab resets it; reloading the page (F5 or Vite HMR full reload) increments it.
