# PR note: Frontscreen reload fix

**Removed periodic reload watchdog; gated any optional kiosk refresh behind explicit opt-in.**

## Summary

- **Root cause of “flashing”:** Full page reloads were driven by **Vite HMR** (client full reload on WS disconnect/liveness), not by app code. No `location.reload()` or navigation is triggered by `SetCoreUrl.tsx` or by any periodic timer in the dashboard app.
- **SetCoreUrl.tsx:** Confirmed it has no health-check, no “watchdog refresh”, and no reload. The only timer is a single 60s one-shot to hide the floating button (prod only; skipped in DEV). Changes made:
  - Documented that this component never triggers a page reload.
  - Added a `useRef` guard so only one 60s timer is ever scheduled and it is cleared on unmount (StrictMode-safe).
- **SSE:** Reconnect on disconnect uses backoff; no reload on error. Single EventSource per URL; closed on cleanup.
- **Feature flags:** `/api/v2/flags` initializes once per document; no refetch interval.
- **Optional kiosk refresh:** Any future automatic refresh for kiosk/frontscreen would be behind an explicit opt-in (e.g. `?kiosk=1` or `localStorage.enableKioskReload === "1"`). None exists today.

## Scope

- **Touched:** `SetCoreUrl.tsx` (comment + StrictMode-safe single timer).
- **Unchanged:** Store creation, publish, preview, frontscreen (stores + slides), auth, SSE gate, flags init.

## Verification

- Leave app on `/frontscreen`, `/frontscreen?mode=slides`, and `/preview/store/:id?view=public` for 3–5 minutes each.
- Expect: no repeating UNLOAD/BOOT in console; no bursts of initial requests every ~20–60s; slides and stores modes still work.
- If reloads persist, ensure Vite 6 is in use and restart dev server; see `docs/FRONTSCREEN_RELOAD_ROOT_CAUSE_AND_FIX.md` for details.
