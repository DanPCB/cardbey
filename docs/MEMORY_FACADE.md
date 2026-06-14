# Unified Memory Facade (P2)

Single entry point for Cardbey intelligence memory: business memory, suitcase, user memory, PIL session events, and mission context.

## Architecture

```
PIL / Briefing / Kernel / Dashboard
              │
              ▼
    memoryFacade.getBundle(context)
              │
    ┌─────────┼─────────┬─────────────┐
    ▼         ▼         ▼             ▼
 business  suitcase   user      pilEvents + mission
```

## Core files

| File | Role |
|------|------|
| `src/lib/memory/memoryTypes.ts` | Shared TypeScript contracts |
| `src/lib/memory/sessionSignals.js` | Client session hint helpers + legacy mapping |
| `src/services/memory/memoryCache.js` | TTL in-process cache + invalidation triggers |
| `src/services/memory/memoryFacade.js` | Parallel fetch, cache, unified bundle |
| `src/services/memory/getMissionMemorySnapshot.js` | Mission + blackboard snapshot |
| `src/services/user/userMemoryService.js` | User memory read helper |
| `src/routes/memoryRoutes.js` | `POST /api/memory/bundle`, `/invalidate` |
| `src/lib/intelligence/memoryAdapter.js` | Legacy adapter (delegates to facade) |

## API

### `POST /api/memory/bundle`

Optional auth + guest session. Body:

```json
{
  "context": {
    "actor": { "type": "store_owner" },
    "storeId": "store-id",
    "sessionId": "sess-id",
    "missionId": "mission-id",
    "sessionHints": { "recentEventTypes": ["attention_signal"] }
  }
}
```

Response: `{ ok: true, bundle: UnifiedMemoryBundle }`

### `POST /api/memory/invalidate`

Requires auth. Clears cached bundle for the normalized context.

### Legacy route (unchanged)

`POST /api/intelligence/memory` still works — `memoryAdapter.fetchMemoryBundle()` delegates to the facade and maps to the legacy response shape.

## Dashboard

| File | Role |
|------|------|
| `src/lib/api/memoryFacadeClient.ts` | API client for `/api/memory/bundle` |
| `src/hooks/useUnifiedMemory.ts` | React Query hook |
| `src/lib/intelligence/client/memoryClient.ts` | Tries facade first, falls back to `/api/intelligence/memory` |

## Cache invalidation

| Trigger | Hook |
|---------|------|
| Mission complete | `closeMissionContext()` |
| Suitcase save | `createSuitcaseItem()` |
| Logout | `POST /api/auth/logout` (when user id known) |
| Store switch | Client calls `POST /api/memory/invalidate` |

Cache key: `memory:{actorType}:{actorId}:{storeId}:{sessionId}:{missionId}`

Default TTL: 120s (store context), 60s (guest/no store).

## Feature flag

```bash
USE_UNIFIED_MEMORY=false  # disables /api/memory routes only; adapter still uses facade
```

## Rollback

1. Set `USE_UNIFIED_MEMORY=false` and restart core.
2. Dashboard `memoryClient.ts` automatically falls back to `/api/intelligence/memory` if facade route fails.

## Tests

```bash
cd apps/core/cardbey-core
pnpm test src/services/memory/memoryFacade.test.js
pnpm test src/services/memory/memoryCache.test.js
pnpm test src/routes/__tests__/memoryRoutes.test.js
```

## Success metrics

| Metric | Target |
|--------|--------|
| Bundle fetch (cache miss, parallel) | < 200ms typical |
| Partial failure tolerance | Graceful null + `meta.partial: true` |
| Actor id in logs | `actor={id}` or `anon:{type}` — never ambiguous `userId: null` |
