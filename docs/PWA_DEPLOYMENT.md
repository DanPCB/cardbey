# Cardbey PWA — Deployment Notes

## Build output

- **Folder:** `apps/dashboard/cardbey-marketing-dashboard/dist/`
- **Serve:** `pnpm preview` (Render uses port 10000)
- **Service worker:** `/service-worker.js` (loads `/sw.js` logic)
- **Manifest:** `/manifest.webmanifest`

## Environment variables (Render)

| Variable | Production | Staging |
|----------|------------|---------|
| `VITE_CORE_BASE_URL` | `https://cardbey-core.onrender.com` | `https://cardbey-core-staging.onrender.com` |
| `VITE_CORE_ORIGIN` | same as above | same as above |
| `VITE_ENV` | `production` | `staging` |

Prefer **empty** `VITE_API_BASE_URL` when dashboard and API share a reverse proxy (`/api` same-origin). Cardbey Render dashboard uses **absolute Core URL** because frontend and Core are separate services.

## SPA rewrites (required)

All **frontend** routes must fall back to `index.html`:

- `/app`, `/explore`, `/space/*`, `/s/:slug`, `/frontscreen`, `/login`, etc.

**Must NOT** rewrite to `index.html`:

- `/api/*` → Core backend
- `/api/stream*` → SSE stream
- `/uploads/*` → static uploads
- `/runtime/*` → runtime endpoints

Render static site: use `_redirects` or platform rewrite rules with API exceptions.

## Service worker rules

- Cache name: `cardbey-app-shell-v1`
- **Never cache:** `/api/*`, `/runtime/*`, streams, auth, uploads, non-GET
- **Cache-first:** Vite hashed `/assets/*`
- **Network-first:** navigations (offline → cached `index.html`)

## Local PWA testing

```bash
cd apps/dashboard/cardbey-marketing-dashboard
pnpm run build
pnpm preview
```

Optional dev SW: `VITE_PWA_SW_DEV=true pnpm dev`

Chrome: Application → Manifest / Service Workers / Lighthouse PWA audit.

## Acceptance checklist

- [ ] Install to home screen (Android Chrome / desktop)
- [ ] Opens `standalone` without browser chrome
- [ ] Login/session persists
- [ ] Nested route refresh (`/app`, `/explore`) works
- [ ] API calls hit Render Core (not localhost) in installed PWA
- [ ] Performer SSE reconnects after network blip
- [ ] Offline banner + disabled mission submit
- [ ] No `/api` responses in SW cache (DevTools → Cache Storage)
