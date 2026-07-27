# Intent Routing Layer

Cardbey routes every `/api` request through a **classification middleware** that assigns an execution path without replacing Express handlers.

## Execution paths

| Path | Meaning |
|------|---------|
| `kernel` | Agent OS pipeline — intake, missions, runtime, orchestrator |
| `direct` | Fast path — auth, CRUD, social, billing, public reads |
| `hybrid` | Governed operations — publish, delete, schedule (user chooses agent vs direct) |

## Architecture

```
Request → compatibilityLayer (normalize legacy flags)
        → intentRoutingMiddleware (classify, set req.executionRouting)
        → Express route handler (unchanged)
```

Hybrid handlers may call `hybridRouter.route(req, res, directHandler)` internally.

## Key files

| File | Role |
|------|------|
| `src/lib/routing/endpointCategories.js` | Category constants and pattern lists |
| `src/lib/routing/endpointRegistry.js` | Mount-prefix rules + categorization |
| `src/lib/routing/intentRouter.js` | `classifyRequest()` / `categorize()` |
| `src/lib/routing/hybridRouter.js` | Agent vs direct for hybrid ops |
| `src/lib/routing/directHandlers.js` | Registry of owning route modules |
| `src/lib/routing/compatibilityLayer.js` | Legacy flag normalization |
| `src/middleware/intentRoutingMiddleware.js` | Express middleware (calls `next()`) |

## Adding a new endpoint

1. **Implement the route** in `src/routes/` and mount in `server.js` as usual.

2. **Classify the mount** — add a prefix rule in `endpointRegistry.js`:

```javascript
{ prefix: '/api/my-feature', category: 'CONTENT_CRUD', note: 'optional description' },
```

3. **Hybrid operations** — if the path includes `publish`, `delete`, `schedule`, etc., it may auto-upgrade to `HYBRID`. For explicit control:

```javascript
// In route handler for governed publish:
import hybridRouter from '../lib/routing/hybridRouter.js';

router.post('/:storeId/publish', requireAuth, async (req, res) => {
  return hybridRouter.route(req, res, async (r, s) => {
    // existing direct publish logic
  });
});
```

4. **Request overrides** (client):

```json
{
  "_forcePath": "kernel",
  "_preferAgent": true,
  "requireConfirmation": true
}
```

5. **Regenerate audit report**:

```bash
cd apps/core/cardbey-core
node scripts/audit-endpoint-routing.mjs --write
```

6. **Add tests** in `tests/routing/intentRouter.test.js` for non-obvious classifications.

## Observability

Middleware sets response headers:

- `X-Cardbey-Execution-Path`: `kernel` | `direct` | `hybrid`
- `X-Cardbey-Intent-Category`: e.g. `AGENT_WORKFLOW`

Enable verbose logs: `LOG_INTENT_ROUTING=true`

Request object: `req.executionRouting` / `req.routing`

## Migration

Legacy flags are normalized automatically:

| Legacy | Replacement |
|--------|-------------|
| `direct_action: true` | Removed — use endpoint classification |
| `skipDirectGuard: true` | Removed — kernel mandatory |
| `_autoSubmit: true` | `requireConfirmation: true` |

Run client migration scan:

```bash
node scripts/migrate-endpoint-routing.mjs --dry-run
```

## Hybrid route wiring

Publish and delete endpoints use `wrapHybridRoute()` from `src/lib/routing/wrapHybridRoute.js`:

| Endpoint | Operation key | Confirmation |
|----------|---------------|--------------|
| `POST /api/stores/publish` | `publish_store` | Optional agent review |
| `POST /api/stores/publish-draft` | `publish_store_draft` | Optional agent review |
| `DELETE /api/stores/:storeId` | `delete_store` | Required (`confirmed: true`) |
| `POST /api/draft-store/:draftId/publish` | `publish_draft` | Optional agent review |
| `POST /api/mini-website/publish/cardbey` | `publish_mini_website` | Optional agent review |
| `DELETE /api/contents/:id` | `delete_content` | Required (`confirmed: true`) |

### Client opt-in

```json
{
  "_preferAgent": true,
  "confirmed": true,
  "_executeAfterReview": true
}
```

- **Direct publish (unchanged):** `POST` with empty body or existing payload.
- **AI review first:** `_preferAgent: true` → returns `{ agentReviewed, suggestions }` without executing.
- **Execute after review:** add `confirmed: true` and `_executeAfterReview: true`.
- **Delete:** always send `confirmed: true` on direct path, or use agent review flow.

## Related docs

- [Endpoint Categorization Report](./ENDPOINT_CATEGORIZATION_REPORT.md)
- [Runtime Kernel Mandatory Report](./RUNTIME_KERNEL_MANDATORY_REPORT.md)
