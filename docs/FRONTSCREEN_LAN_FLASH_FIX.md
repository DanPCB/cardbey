# Frontscreen LAN flashing + repeated /api/stream and /api/v2/flags – fix checklist

## Cause (summary)

- **LAN flashing:** On mobile (e.g. `http://192.168.1.8:5174/frontscreen`), Vite HMR was configured for `localhost`. The client tried `ws://localhost:5174`, which on the phone is the device itself, so the connection failed and Vite fell back to **polling for restart**, causing full reloads and UI flashes.
- **Repeated /api/stream:** AppShell started the global SSE (configure + attachLifecycle + subscribe) on every route, including `/frontscreen`. So in **stores mode** we still opened `/api/stream` even though only the store feed is needed.
- **Repeated /api/v2/flags:** Flags are loaded once via `initFeatureFlags()`. Repeated calls were from **full page reloads** (HMR polling), not from refetch/polling in app code.

## Fixes applied

1. **Vite HMR dual-mode** (`vite.config.js`)
   - Default: `host: "localhost"`, `hmr.host: "localhost"` (unchanged for desktop dev).
   - **LAN mode:** When `LAN=1` and `LAN_HOST=<your-ip>` (e.g. `192.168.1.8`), `host: true` and `hmr.host: LAN_HOST` so the client connects to `ws://<LAN_IP>:5174` and HMR does not fall back to polling.
   - Script: `pnpm run dev:lan` (sets `LAN=1`). Set `LAN_HOST` to your machine’s LAN IP.

2. **AppShell: no SSE on /frontscreen** (`AppShell.tsx`)
   - If `location.pathname === '/frontscreen'`, we **skip** SSE setup (configure, attachLifecycle, subscribe). Feature flags still init.
   - **Stores mode:** No `/api/stream` at all; only store feed requests.
   - **Slides mode:** BackgroundFeed mounts and calls `subscribe()` → one SSE connection when that tab is active.

3. **BackgroundFeed SSE: single stable connection** (`CardbeyFrontscreenTopNavPreview.jsx`)
   - SSE effect now has **empty dependency array** and uses **refs** for `reloadSlides`, `feedType`, `selectedState` so the handler always sees current values without re-subscribing.
   - One subscription per BackgroundFeed mount; no reconnect loop when switching tabs.

4. **Flags**
   - No code change. `initFeatureFlags()` is one-time (guarded by `initialized` / `initPromise`). No refetch interval or React Query for flags.

## Verification checklist

- [ ] **/frontscreen (stores) on LAN mobile:** Open `http://<LAN_IP>:5174/frontscreen` on phone. UI is stable, no flashing. Network: **zero** `GET /api/stream`; only `GET /api/public/stores/feed?...` when loading/switching tabs.
- [ ] **/frontscreen?mode=slides:** One `GET /api/stream?key=admin` that stays open; no rapid repeated `/api/stream` lines.
- [ ] **Console:** No “polling for restart” or “server connection lost” from Vite.
- [ ] **Network:** No periodic full document reloads; only XHR/fetch for feed and (in slides mode) one SSE.
- [ ] **Regression:** `/frontscreen?mode=slides` behavior unchanged (slides, SSE, swipe). Store reels (Food/Products/Services tabs) and “Open Store” still work.

## Running dev for LAN mobile testing

```bash
# From apps/dashboard/cardbey-marketing-dashboard
# Replace 192.168.1.8 with your machine’s LAN IP (ipconfig / ifconfig)
LAN=1 LAN_HOST=192.168.1.8 pnpm run dev:lan
# Or with explicit host/port:
LAN=1 LAN_HOST=192.168.1.8 pnpm run dev -- --host --port 5174 --strictPort
```

Then on the phone open: `http://192.168.1.8:5174/frontscreen`.

## Optional: confirm remounting (debug)

Set `localStorage.setItem('cardbey_debug_frontscreen_mount', '1')` and reload. Console will log `[MOUNT]` / `[UNMOUNT]` for CardbeyFrontscreenTopNavPreview, BackgroundFeed, and StoreReelsFeed. If you see repeated MOUNT/UNMOUNT without navigating, something is still remounting (e.g. parent or routing). Remove the flag or the log blocks after debugging.

## Production-like test (no HMR)

If you want to confirm flashing is HMR-related:

```bash
pnpm run build
pnpm run preview -- --host 0.0.0.0 --port 5174
```

Open on mobile: `http://<LAN_IP>:5174/frontscreen`. If preview is stable and dev was not, the fix is HMR + SSE gating.
