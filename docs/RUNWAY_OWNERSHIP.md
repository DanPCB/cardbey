# Cardbey runway ownership (canonical)

**Goal:** One visible owner per user-facing capability. Legacy paths may remain for compatibility but must log `[runway-legacy]` and must not be the default for new UI.

**Related:** `apps/core/cardbey-core/docs/RUNWAY_INVENTORY.md` (store-build entry paths), `docs/LOCAL_DEV.md`.

---

## Ownership table

| Capability | Canonical owner | Primary API / module | Legacy / duplicate (logged, not default) |
|------------|-----------------|----------------------|------------------------------------------|
| **Mission execution** | Performer Intake V2 + mission pipeline | `POST /api/performer/intake/v2`, `POST /api/missions/:id/run`, `executeStoreMissionPipelineRun` | `POST /api/performer/intake` (v1); `POST /api/orchestrator/run` (batch jobs); `POST /api/mi/orchestra/start` (MI mirror) |
| **Store / website creation** | Draft store + shared build job | `POST /api/draft-store/*`, `createBuildStoreJob` → `runBuildStoreJob` | `POST /api/store-draft/*` (alias router); `POST /api/business/create` (orchestra shape); `POST /api/automation/store-from-input` |
| **Blackboard / reasoning lines** | Mission projection + DB persist | `GET /api/missions/:id/state`, `missionProjectionStore`, `broadcastMissionReasoningLine` (`simpleSse.js`) | Duplicate `BlackboardFeed` in console sidebars (UI-only); left-rail blackboard deprecated |
| **Artifacts (preview URLs, refresh)** | Artifacts API + mission projection | `POST /api/artifacts/:id/refresh-url`, projection `artifacts[]`, `artifactSse.js` | Regex fallbacks in `ConsoleCentreColumn`; stale cache without projection refresh |
| **Device playback (TV)** | Device Engine V2 | `GET /api/device/:deviceId/playlist/full`, `POST /api/device/:deviceId/heartbeat` | `GET /api/screens/:id/playlist/full` (screenId == device id shim) |
| **Playlist preview (dashboard)** | Device Engine or signage preview APIs | Device list + binding preview; signage engine preview | C-Net ` /api/devices/*` assignment panel (legacy note in UI) |
| **Journey templates** | Journeys router | `GET /api/journeys/templates` (`journeys.routes.js`) | None (was unmounted — fixed in server mount) |
| **SSE (mission console)** | `simpleSse.js` + `realtime/sse.js` | `GET /api/stream?key=agent-chat&missionId=&streamToken=` | `GET /api/stream?key=admin` (dev device stream only; blocked in production) |
| **SSE (AI orchestration)** | `ai/sse/router.js` | `GET /api/ai/stream` | — |
| **Device pairing** | Device Engine | `POST /api/device/request-pairing`, `complete-pairing` | `POST /api/screens/pair/*` (TV shim) |
| **Public store render** | Storefront + public routes | `GET /api/storefront/frontscreen`, `GET /api/public/stores/:slug` | Old draft-only public paths |

---

## Execution entry points (map)

### Performer mission intake

| Entry | Owner |
|-------|--------|
| `POST /api/performer/intake/v2` | **Canonical** — routing, confirmations, proactive steps |
| `POST /api/performer/intake` | Legacy v1 — OCR/card path only when `VITE_INTAKE_V2=false` |
| `POST /api/performer/missions/*` | Performer mission helpers |
| `POST /api/missions/:id/run` | Store/website pipeline execution |
| Mission projection SSE | `missionProjectionSource` + `key=agent-chat` |

### Store / website creation

| Entry | Owner |
|-------|--------|
| `POST /api/draft-store` | **Canonical** create/generate/commit |
| `POST /api/store-draft` | Compatibility mount (same `draftStoreRoutes`) |
| `POST /api/business/create` | Orchestra-shaped create (R5a) |
| `POST /api/mini-website/publish/*` | Publish after draft |

### Blackboard feed

| Entry | Owner |
|-------|--------|
| HTTP poll `BlackboardFeed.tsx` | Mission state + blackboard poll flags |
| SSE reasoning lines | `broadcastMissionReasoningLine` |
| Console UI | `ConsoleCentreColumn` inline stream (not left sidebar) |

### Artifacts / preview actions

| Entry | Owner |
|-------|--------|
| Mission projection `artifacts` | **Canonical** for console performer |
| `POST /api/artifacts/:id/refresh-url` | Signed URL refresh |
| Overview actions | Must queue via mission intents (Single Runway guardrail in dashboard) |

### Playlist / device

| Entry | Owner |
|-------|--------|
| `GET /api/device/:deviceId/playlist/full` | **Canonical** playback |
| `GET /api/screens/:id/playlist/full` | Legacy alias (screenId) |

### SSE subscriptions

| Entry | Owner |
|-------|--------|
| Mission console | `agent-chat` + `streamToken` |
| Devices admin (dev) | `key=admin` via `sseClient` (non-production) |
| AI metrics/logs | `/api/ai/stream` |

### Journey templates

| Entry | Owner |
|-------|--------|
| `GET /api/journeys/templates` | **Canonical** (public list) |
| `GET /api/journeys/templates/:slug` | Template detail |

---

## Server mount checklist

These routes must stay mounted for current UI (see `src/server.js`):

- `draft-store` + `store-draft` (alias)
- `performer/intake/v2` before broad `/api/performer`
- `device` engine before legacy screens
- `realtimeRoutes` at `/api` (includes `/api/stream`)
- **`/api/journeys`** — `journeys.routes.js`

---

## Dashboard rules (no silent override)

1. **Intake:** Prefer Intake V2; legacy v1 only behind env flag.
2. **SSE:** Mission console must not use `key=admin` (see `AppShell.tsx` comment).
3. **Store draft API:** New code uses `apiPaths` `draft-store` / `STORE_DRAFT` documented aliases.
4. **Devices table:** Device Engine V2 for pairing/playback; legacy C-Net panel labeled in UI.

---

## Logging

Deprecated HTTP usage emits structured logs:

```text
[runway-legacy] CODE=LEGACY_SCREEN_PLAYLIST_FULL method=GET path=... canonical=GET /api/device/:deviceId/playlist/full
```

Implemented in `src/middleware/runwayLegacyGuard.js`.
