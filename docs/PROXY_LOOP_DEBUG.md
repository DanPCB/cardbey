# Proxy loop: repeated flags + stream + preview

## What you see

Proxy logs show the same three requests repeating:

```
[proxy] GET /api/v2/flags -> http://127.0.0.1:3001/api/v2/flags
[proxy] GET /api/stream?key=admin -> http://127.0.0.1:3001/api/stream?key=admin
[proxy] GET /api/store/.../preview -> http://127.0.0.1:3001/api/store/.../preview
... (same three again) ...
```

## What it means

That pattern means **full page reloads** are happening in a loop. On each reload:

1. **Flags** – App shell runs, calls `initFeatureFlags()` → `GET /api/v2/flags`.
2. **Stream** – App shell starts the admin SSE client → `GET /api/stream?key=admin`.
3. **Preview** – The preview page loads and fetches store data → `GET /api/store/:id/preview`.

So the app is not “re-requesting in a loop” inside one page; the **whole page is reloading** again and again.

## Likely cause: Vite HMR full reload

In dev, the usual cause is **Vite’s HMR client** deciding to do a **full page reload** (e.g. when the HMR WebSocket disconnects or a liveness check fails). That is **not** triggered by app code (no timer or SSE handler in the dashboard calls `location.reload()`).

## What to check

1. **Vite version**  
   Use Vite 6+ so HMR is less aggressive about full reloads on WS disconnect:
   - `npx vite --version` (should be 6.x).
   - Upgrade with your package manager if needed (e.g. `pnpm add -D vite@^6`).

2. **HMR WebSocket stability**  
   - On **localhost**: HMR usually stays connected; if not, check firewall/antivirus and that nothing is closing the WS.
   - On **LAN** (`VITE_DEV_LAN=1`): set `VITE_HMR_HOST` to your machine’s LAN IP so the client connects to `ws://<LAN_IP>:5174`. If you see **“WebSocket closed without opened”** or **“Firefox can’t establish a connection to the server at ws://192.168.x.x:5174”**, the HMR WebSocket is being blocked or closed (firewall, network, or server). The **app and SSE still work**; only hot reload is affected. To fix: allow port 5174 (TCP) for the dev machine’s firewall, or use the app on localhost only.

3. **Reload debug (opt-in)**  
   To confirm that full reloads are happening and how often:
   - In dev: `localStorage.setItem('cardbey_debug_reload', '1')` then refresh, or open with `?debugReload=1`.
   - Console will show `[RELOAD] boot #N` and `[LOOP] beforeunload` on each reload.
   - Disable with `localStorage.removeItem('cardbey_debug_reload')` and refresh (or remove `?debugReload=1`).

4. **Proxy timeouts**  
   The dashboard’s Vite proxy already sets `timeout: 0` and `proxyTimeout: 0` for `/api` so long-lived SSE is not closed by the proxy. No change needed unless you overrode this.

## App-side guarantees (no loop from app code)

- **Feature flags** – Fetched once per document; guarded so remounts/HMR do not refetch.
- **SSE** – Single connection; reconnect on disconnect (no reload). On `/frontscreen` the global admin stream is not started.
- **Preview** – Store preview is loaded once per route/params; refs prevent duplicate fetches in the same document.
- **SetCoreUrl** – The 60s timer only hides the floating button (state only); it never reloads or navigates.
- **Reload debug** – Only runs when explicitly enabled (`cardbey_debug_reload` or `?debugReload=1`); it only logs, never calls `location.reload()`.

So if the triple (flags + stream + preview) keeps repeating, treat it as **full reloads** and focus on **Vite/HMR and network**, not on app logic causing a request loop.
