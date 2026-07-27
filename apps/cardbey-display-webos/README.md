# Cardbey Display (LG webOS)

Thin webOS shell around [`@cardbey/display-runtime`](../../packages/cardbey-display-runtime).

- App id: `com.cardbey.display`
- Backend: Device Engine V2 (`/api/device/*`) — **no** `/api/display/*`
- Phase 3: pairing + session activation
- Phase 4: HTML5 playback (`VITE_ENABLE_PLAYBACK=true`)

## Scripts

```bash
pnpm --filter @cardbey/display-webos dev
pnpm --filter @cardbey/display-webos test
pnpm --filter @cardbey/display-webos build
pnpm --filter @cardbey/display-webos package
```

## Enable pairing

Copy `.env.example` → `.env.local`:

```bash
VITE_DISPLAY_PROFILE=staging
VITE_ENABLE_PAIRING=true
VITE_API_BASE_URL=https://cardbey-core-staging.onrender.com
VITE_DASHBOARD_BASE_URL=https://cardbey-dashboard-staging.onrender.com
```

Fixture mode (DEV only):

```bash
VITE_USE_FIXTURE_TRANSPORT=true
VITE_ENABLE_PAIRING=true
```

## Claim deep-link

QR opens:

`{VITE_DASHBOARD_BASE_URL}/devices?pairCode=<code>&pairSessionId=<sessionId>`

## Playback

```bash
VITE_ENABLE_PLAYBACK=true
```

See `docs/cardbey-display/webos-playback.md`.

## Docs

- `docs/cardbey-display/webos-pairing.md`
- `docs/cardbey-display/webos-playback.md`
- `docs/cardbey-display/webos-local-development.md`
- `docs/cardbey-display/webos-known-limitations.md`
