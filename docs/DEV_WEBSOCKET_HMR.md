# Dev WebSocket (HMR) Connection Fix

## Symptom

- **Firefox**: "Firefox can’t establish a connection to the server at ws://192.168.1.8:5174/?token=..."
- **Console**: `Uncaught (in promise) Error: WebSocket closed without opened.`

Vite’s HMR (Hot Module Replacement) client is trying to connect to a WebSocket on a different host than the one you’re using in the browser (e.g. page on `localhost` but WS on `192.168.1.8`).

## Cause

- Dashboard `vite.config.js` supports **LAN mode**: when `VITE_DEV_LAN=1` or `VITE_HMR_HOST` is set, the dev server binds to `0.0.0.0` and the HMR client may use a LAN IP.
- If you open the app at **http://localhost:5174** but the HMR client was configured for **192.168.1.8** (e.g. from a previous run or `.env`), the browser will try `ws://192.168.1.8:5174` and that can fail (firewall, or you’re not on that network).

## Fix

**Option A – Force localhost HMR (recommended when you see ws://192.168.1.x)**

1. In the dashboard project, create or edit `.env` and set:
   ```bash
   VITE_HMR_FORCE_LOCALHOST=1
   ```
2. Restart the Vite dev server (`npm run dev` or `pnpm dev` in the dashboard).
3. Open the app at **http://localhost:5174**. HMR will use `ws://localhost:5174` and the connection error should stop.

**Option B – Use localhost only (no LAN env vars)**

1. Ensure **no** LAN env vars are set for dev:
   - Do **not** set `VITE_DEV_LAN` or `VITE_DEV_LAN=1`.
   - Do **not** set `VITE_HMR_HOST` or `VITE_DEV_HMR_HOST`.
2. Restart the Vite dev server and open **http://localhost:5174**.

**Option C – Use LAN IP consistently**

1. Set `VITE_DEV_LAN=1` (and optionally `VITE_HMR_HOST=<your-machine-LAN-IP>`) if you need to test from another device.
2. Restart the Vite dev server.
3. Open the app at **http://192.168.1.8:5174** (or whatever IP the dev server prints). HMR will use the same host and should work.

## Summary

- **localhost dev**: Don’t set `VITE_DEV_LAN` / `VITE_HMR_HOST`; open **http://localhost:5174**.
- **LAN/mobile dev**: Set LAN mode, then open the app at **http://\<your-ip\>:5174** so the WebSocket host matches the page.
