# @cardbey/display-runtime

Platform-neutral TypeScript runtime for **Cardbey Display** clients (LG webOS, Samsung Tizen, browser player, future Android migration).

## Purpose

Reproduce Device Engine V2 pairing, heartbeat, playlist normalisation, sequencing, sync, and application state — without Android, webOS, DOM, or React dependencies.

## Non-goals

- No UI / rendering
- No `/api/display/*` backend
- No user login on the device
- No hardcoded API hosts
- No IndexedDB / Luna / Capacitor inside this package
- Does not replace the Android APK in Phase 1

## Architecture

```text
Shell (webOS / Tizen / browser)
  → injects HttpTransport, DisplayStorage, Clock, DisplayRuntimeConfig
  → uses PairingController / HeartbeatController / SyncController
  → renders based on DisplayRuntimeState + DisplayManifest

@cardbey/display-runtime
  → Device V2 API client
  → normalize playlist/full → DisplayManifest
  → pure sequencer + schedule filter
  → state reducer
```

Canonical backend: **Device Engine V2** (`/api/device/*`).  
Contract map: `docs/cardbey-display/device-v2-contract-map.md`.

## Dependency injection

| Dependency | Role |
|------------|------|
| `DisplayRuntimeConfig` | Shell-provided; validated by `validateRuntimeConfig` |
| `HttpTransport` | Injected HTTP (`createFetchTransport` optional) |
| `DisplayStorage` | Persist identity/session/manifest |
| `Clock` | Deterministic scheduling / tests |
| `TelemetrySink` | Optional; default `nullTelemetrySink` |

## Pairing

TV flow (not dashboard claim):

1. `POST /api/device/request-pairing`
2. Poll `GET /api/device/pair-status/:sessionId`
3. On `claimed`, optional `POST /api/device/pair-complete`
4. Persist `DeviceSession` (`pairingState: PAIRED`)

## Playlist

`GET /api/device/:deviceId/playlist/full` → `normalizePlaylist` → `DisplayManifest`.

## Sync / heartbeat

- Heartbeat default interval: 30s (Android parity)
- Sync polling: shell-configurable (default 30s)
- Invalid remote responses **preserve** last valid cached manifest

## Security limitations

```text
P0 before broad fleet deployment:
Introduce revocable device-scoped credentials for Device Engine V2.
```

Today, TV routes are largely unauthenticated. `DeviceSession.deviceSecret` is optional for a future token without rewriting controllers. Never store user JWTs. Never log secrets.

## Integrate a shell

```ts
import {
  validateRuntimeConfig,
  createFetchTransport,
  createDeviceApiClient,
  createMemoryStorage, // replace with platform storage
  PairingController,
  HeartbeatController,
  SyncController,
  createDeviceIdentity,
  FakeClock, // use SystemClock in production
} from '@cardbey/display-runtime';

const config = validateRuntimeConfig({
  apiBaseUrl: injectedBaseUrl,
  platform: 'webos_tv',
  appVersion: '1.0.0',
  allowInsecureLocalHttp: false,
});
```

## Scripts

```bash
pnpm --filter @cardbey/display-runtime test
pnpm --filter @cardbey/display-runtime typecheck
pnpm --filter @cardbey/display-runtime build
```
