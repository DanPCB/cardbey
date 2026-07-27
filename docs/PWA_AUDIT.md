# Cardbey PWA — Phase 1 audit

## Current state (pre-enhancement)

| Item | Status |
|------|--------|
| Build output | `dist/` via `vite build --mode production` |
| Base URL | `/` (absolute, SPA-safe on Render) |
| API routing | `buildApiUrl()` — relative `/api` on Vite :5174; absolute Core origin in prod |
| Core resolver | `getEffectiveCoreApiBaseUrl()` / `getCoreOrigin()` in `getCoreApiBaseUrl.ts` |
| Manifest | `public/manifest.webmanifest` (partial) |
| Service worker | `public/sw.js`, registered in `main.jsx` when `import.meta.env.PROD` |
| Icons | Script exists; PNGs were missing — regenerated |
| Render | `pnpm preview` on port 10000; env points to `cardbey-core.onrender.com` |

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| Dashboard routing | SW navigation fallback | Network-first for navigations; only offline uses cached `index.html` |
| Auth/session | Caching `/api` | Explicit bypass for `/api/*`, `/uploads/*`, auth, stream, pil |
| SSE / Performer | SW intercepting streams | Pass-through for `text/event-stream`, `/api/stream`, cross-origin Core |
| API proxy (dev) | localhost guard in PWA | Block loopback Core URL when installed PWA on Render origin |
| Uploads / camera | SW caching POST | SW ignores non-GET |
| Missions | Forced SW reload | Update banner only; no auto-reload during active stream |

## Gaps addressed in this pass

- Manifest fields + maskable icons (`public/pwa-icon-*.png`)
- `index.html` Apple/safe-area meta
- SW at `/service-worker.js` → `cardbey-app-shell-v1`, expanded bypass list, cache-first hashed assets
- PWA API base logging + localhost block in standalone non-dev (`pwaRuntime.ts`)
- `PwaShell`: offline banner, SSE reconnect banner, soft SW update prompt
- Install UX in Settings (`usePwaInstall`, iOS help on demand)
- Offline mission submit guard in Performer console
- Safe-area CSS utilities (`index.css`)
- Tests: `pwaRuntime.test.ts`, i18n `pwa.*` contract
- Deployment notes: `docs/PWA_DEPLOYMENT.md`

## Non-goals (unchanged)

- Capacitor, React Native, push, background sync, auth model changes
