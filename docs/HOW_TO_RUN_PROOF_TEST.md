# How to run the automation proof test

After implementing the Minimum Fix Set, you can verify headless store creation with the following.

## Supported paths (single source of truth)

| Path | Purpose |
|------|--------|
| **Draft-only (async)** | `POST /api/mi/orchestra/start` — job auto-runs; poll `GET /api/mi/orchestra/job/:jobId` until completed. |
| **Publish (auth)** | `POST /api/stores/publish` — publish an existing draft (e.g. by `generationRunId`). |
| **End-to-end proof (sync)** | `POST /api/automation/store-from-input` — create draft, generate, publish in one request (auth required). |

Use these as the canonical entrypoints; they remove confusion for new devs.

## Prerequisites

- Core API running (e.g. `cd apps/core/cardbey-core && npm run dev`)
- Valid auth token (login via `/api/auth/login` or use a test user)

## Proof test: `POST /api/automation/store-from-input`

Creates a draft from minimal input, generates it, publishes, and returns a store URL in one request.

### cURL

```bash
# Replace YOUR_BEARER_TOKEN with a real JWT (e.g. from login response)
curl -X POST http://localhost:3001/api/automation/store-from-input \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN" \
  -d '{"businessName":"French Baguette","businessType":"cafe","location":"Melbourne"}'
```

### Expected output (200)

```json
{
  "ok": true,
  "storeId": "<cuid>",
  "storeUrl": "/app/store/<storeId>",
  "slug": "<generated-slug>"
}
```

### Expected output (401 without auth)

```json
{
  "ok": false,
  "error": "unauthorized",
  "message": "Authentication required"
}
```

### Getting a token

1. Register or login:  
   `POST /api/auth/login` with `{ "email": "...", "password": "..." }`  
   Response includes `token` (or similar; check your auth route).
2. Use that value as `Authorization: Bearer <token>`.

## Optional: orchestra/start (draft only, no publish)

To create only a draft (and publish later via UI or `/api/stores/publish`), use:

```bash
curl -X POST http://localhost:3001/api/mi/orchestra/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN" \
  -d '{"goal":"build_store","businessName":"French Baguette","businessType":"cafe","location":"Melbourne"}'
```

Response includes `jobId`, `storeId` (e.g. `"temp"`), `generationRunId`, `draftId`. The job runs automatically (no need to call `/run`). Poll `GET /api/mi/orchestra/job/:jobId` until `status === 'completed'`, then use `generationRunId` with `POST /api/stores/publish` to publish.

## Supported create path

- **Full headless (draft + publish):** `POST /api/automation/store-from-input` (auth required).
- **Create job (draft only, auto-run):** `POST /api/mi/orchestra/start` with `goal: "build_store"`, or `POST /api/business/create` with body `{ sourceType: "form", payload: { businessName, businessType?, location? } }`. Both return `jobId`, `storeId`, `tenantId`, `generationRunId`.

## Notes and limitations

- **Latency (Risk D):** `POST /api/automation/store-from-input` is synchronous: it runs `generateDraft()` then `publishDraft()` in one request. AI and image generation can take tens of seconds. Typical API gateways (30–60s) may time out. Use this endpoint for **internal proof** or **admin** flows; for production user-facing flows, prefer orchestra/start + poll + publish, or async workers. Document expected latency (e.g. 30–90s) when using this endpoint.
- **Security (Risk E):** `POST /api/mi/orchestra/job/:jobId/run` remains callable headlessly (dev tool / safety net). For hardening later: restrict to internal/dev environment, or require the same auth as `/start`, so it is not usable as an unauthenticated trigger.
- **Optional later hardening (parked):** Restrict `/job/:id/run` in prod; consider an async version of the proof endpoint to avoid gateway timeouts. Not required for the minimum fix.
