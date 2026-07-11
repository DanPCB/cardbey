# Cardbey Android Application

Official native Android client for the Cardbey platform. This app connects to the existing Cardbey Core backend — it does not duplicate Runtime Authority, Performer planning, or business rules.

## Location

```
apps/android/
```

The Capacitor shell at `apps/dashboard/cardbey-marketing-dashboard/android/` is a WebView wrapper and is **not** this project. The signage player at `apps/dashboard/cardbey-marketing-dashboard/app/` (`com.cardbey.slide`) is a separate CNET device client.

## Documentation index

| Document | Purpose |
|----------|---------|
| [architecture.md](./architecture.md) | Module boundaries, clean architecture, ADR |
| [api-contracts.md](./api-contracts.md) | Backend endpoint map and Kotlin model sources |
| [navigation.md](./navigation.md) | Signed-in/out IA and deep links |
| [performer-runtime.md](./performer-runtime.md) | Intake V2, streaming, mission state |
| [uploads-and-scanning.md](./uploads-and-scanning.md) | Media capture and governed upload flow |
| [security.md](./security.md) | Token storage, permissions, network policy |
| [testing.md](./testing.md) | Unit, integration, and Compose test plan |
| [release.md](./release.md) | Build flavors and Play Store workflow |
| [backend-gaps.md](./backend-gaps.md) | Missing or unclear contracts for mobile |

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Repository audit | Complete | See audit sections in each doc |
| 1 — Foundation | In progress | Gradle project, shell, network, auth skeleton |
| 2 — Auth & shell | Pending | Real sign-in against `/api/auth/*` |
| 3 — Marketplace | Pending | Public feed + store detail |
| 4 — Performer slice | Pending | Intake V2 + SSE + cards |
| 5 — Upload & scan | Pending | CameraX + governed review |
| 6+ | Pending | Spaces, notifications, expanded features |

## Quick start

### Prerequisites

- Android Studio Ladybug or newer
- JDK 17
- Android SDK 35
- Running Cardbey Core (`pnpm dev:core` → `http://127.0.0.1:3001`)

### Build

```bash
cd apps/android
./gradlew :app:assembleDevDebug
```

### Emulator / device API URL

| Environment | API base (no `/api` suffix) |
|-------------|----------------------------|
| Dev (emulator) | `http://10.0.2.2:3001` |
| Dev (LAN device) | `http://<your-lan-ip>:3001` |
| Staging | `https://cardbey-core-staging.onrender.com` |
| Production | `https://cardbey-core.onrender.com` |

Dev flavor defaults to `10.0.2.2:3001` for the Android emulator. Override in debug builds via the Developer screen.

### Verify connectivity

Launch the app → Developer (debug only) → **Ping API** should return `ok`.
