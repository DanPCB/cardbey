# API Contract Map

Source of truth: Cardbey Core (`apps/core/cardbey-core`) and dashboard TypeScript clients.

## Base URL convention

```
{API_BASE_URL}/api/{path}
```

Examples:

- Health: `GET /api/ping`
- Login: `POST /api/auth/login`
- Intake: `POST /api/performer/intake/v2`

**Android `BuildConfig.API_BASE_URL`** must not include `/api`.

| Environment | Origin |
|-------------|--------|
| Local emulator | `http://10.0.2.2:3001` |
| Local device | `http://192.168.x.x:3001` |
| Staging | `https://cardbey-core-staging.onrender.com` |
| Production | `https://cardbey-core.onrender.com` |

Public web (deep links): `https://cardbey.com` (staging: dashboard-staging hosts).

## Authentication

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/register` | — | `{ email, password, fullName? }` |
| POST | `/api/auth/login` | — | `{ email, password }` → `{ ok, token, accessToken, user }` |
| GET | `/api/auth/me` | Bearer | Session restore |
| POST | `/api/auth/logout` | Optional | Client must clear local token |
| POST | `/api/auth/guest` | — | Guest JWT when `GUEST_AUTH_ENABLED` |

**No refresh token.** Re-login on 401. JWT expiry: `JWT_EXPIRES_IN` (default 7d).

**TypeScript reference:** `packages/api-client/src/index.ts`, `dashboard/src/services/auth.ts`

## Health

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/ping` | `{ ok: true, status: "ok" }` |
| GET | `/api/health` | Lightweight status + features |

## Marketplace (public)

| Method | Path | Pagination |
|--------|------|------------|
| GET | `/api/public/stores/feed` | `limit`, `cursor` → `{ items, nextCursor }` |
| GET | `/api/public/stores/:slug` | — |
| GET | `/api/public/stores/:slug/products` | `limit`, `offset` |
| GET | `/api/discovery/search` | `page`, `limit`, `query`, … |
| GET | `/api/storefront/frontscreen` | `limit`, `type` |

## Stores (authenticated)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/stores` | User's stores |
| GET | `/api/stores/:id` | Owner detail |
| GET | `/api/store/:id/context` | Active store context payload |
| GET | `/api/store/:id/preview` | Public preview |

## Performer / Runtime

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/performer/intake/v2` | Main intent dispatch |
| POST | `/api/performer/intake/v2/confirm` | `{ previewId, missionId?, currentContext? }` |
| POST | `/api/performer/runtime/ui-action` | Governed mutations |
| GET | `/api/performer/runtime/:missionId/state` | Runtime snapshot |
| GET | `/api/performer/runtime/:missionId/stream` | JSON poll (`afterSeq`, `limit`) |

**Response type:** `IntakeV2Response` — `dashboard/src/app/console/performer/useIntakeV2.ts`

### Intake `action` discriminators (card routing)

| action | UI card |
|--------|---------|
| `clarify`, `clarify_store` | Clarification / store picker |
| `approval_required` | Approval card → `/intake/v2/confirm` |
| `show_execution_plan` | Execution plan → `/topology-decision` |
| `awaiting_owner_input` (runtimeState) | Owner input → `/owner-input` |
| `store_mission_started` | Mission progress |
| `error`, `validation_error` | Error recovery |

## Missions

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/missions/:missionId/state` | Pipeline status |
| GET | `/api/missions/:missionId/blackboard` | Events `?afterSeq=&limit=` |
| POST | `/api/missions/:missionId/topology-decision` | `{ decision: approve\|reject\|modify }` |
| POST | `/api/missions/:missionId/owner-input` | Clarification resume |
| POST | `/api/missions/:missionId/approve` | Pipeline approval |
| POST | `/api/missions/:missionId/resume` | Resume paused |
| GET | `/api/missions/recent-for-threads` | Activity list |

### Mission status values

`requested` → `planned` → `awaiting_confirmation` → `queued` → `executing` → `paused` | `completed` | `failed` | `cancelled` | `awaiting_input` | `awaiting_owner_input`

**Canonical runtime states:** `awaiting_perception`, `awaiting_context`, `awaiting_approval`, `awaiting_owner_input`, `executing`, `completed`, `failed`

## Streaming

| Mechanism | Endpoint |
|-----------|----------|
| SSE (primary) | `GET /api/stream?key=agent-chat&missionId=&streamToken=` |
| Stream token | `POST /api/agent-messages/stream-token` |
| Poll fallback | `GET /api/missions/:id/blackboard?afterSeq=` |

Auth: `Authorization: Bearer` or `?token=` query param.

## Upload / media

| Method | Path |
|--------|------|
| POST | `/api/uploads/create` |
| GET | `/api/upload/mine` |
| POST | `/api/stores/:storeId/upload/hero` (etc.) |
| POST | `/api/performer/runtime/ui-action/upload-hero` (etc.) |

Media URLs: use backend `url` / `publicUrl` / `normalizedUrl` — do not reconstruct CDN paths. See `apps/core/cardbey-core/src/lib/storage/publicUrl.js`.

## Runtime session

| Method | Path |
|--------|------|
| GET | `/api/runtime/session/active` |
| POST | `/api/runtime/session/select-store` |
| POST | `/api/runtime/session/resume-mission` |

## Spaces

No `/api/spaces` endpoint. Spaces are client-resolved from:

- `GET /api/auth/me` → `user.stores`
- `GET /api/store/:id/context`
- `GET /api/public/stores/:slug`

Dashboard model: `dashboard/src/types/space.ts`

## Suitcase

| Method | Path |
|--------|------|
| GET | `/api/suitcase/items` | `limit`, `cursor`, `spaceId`, `storeId` |
| POST | `/api/suitcase/items` | Create vault item |

## Devices (CNET)

| Method | Path |
|--------|------|
| POST | `/api/device/request-pairing` |
| POST | `/api/device/claim` |
| GET | `/api/device/pair-status/:sessionId` |

## Standard error envelope

```json
{ "ok": false, "error": "code", "message": "Human-readable" }
```

## Kotlin model mapping strategy

1. Mirror `@cardbey/api-client` and `useIntakeV2.ts` field names with `@SerialName` where needed.
2. Unknown JSON fields ignored (`ignoreUnknownKeys = true`).
3. Adapter interfaces for uncertain contracts — see [backend-gaps.md](./backend-gaps.md).
