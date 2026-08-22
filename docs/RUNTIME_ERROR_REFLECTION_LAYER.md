# Runtime Error Reflection Layer

Cardbey captures runtime failures from the browser and server, classifies them, stores them, and surfaces structured diagnostics to Performer/Admin — so debugging does not rely on code-only guessing.

## Architecture

```
Browser (dashboard)
  ├─ Global errors / unhandledrejection
  ├─ Media element failures (hero video CORS, 404)
  ├─ API fetch failures (500, connection)
  ├─ Preview crash boundary
  └─ Deploy version handshake (dashboard SHA vs core SHA)
        │
        ▼ POST /api/runtime/diagnostics  (sendBeacon / fetch keepalive)
cardbey-core
  ├─ diagnosticSanitizer  (redact secrets, strip signed URLs)
  ├─ diagnosticClassifier (media_cors_blocked, deploy_version_mismatch, …)
  └─ diagnosticStore      (JSONL + in-memory recent buffer)
        │
        ▼ GET /api/runtime/diagnostics/recent  (admin)
Performer / Admin UI — Runtime Observations panel
  └─ Copy Cursor packet (symptom, classification, evidence, nextAction)
```

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/runtime/diagnostics` | optional | Ingest client/runtime events |
| GET | `/api/runtime/version` | public | Core commit SHA, storage driver |
| GET | `/api/runtime/diagnostics/recent` | admin | Recent classified observations |

Feature flag: `RUNTIME_DIAGNOSTICS_ENABLED=true` (default on).

## Frontend collectors

Location: `apps/dashboard/cardbey-marketing-dashboard/src/lib/runtimeDiagnostics/`

- `runtimeDiagnosticsClient.ts` — `sendRuntimeDiagnostic()`, dedupe (30s), breadcrumbs (50)
- `mediaDiagnostics.ts` — hero upload + CDN playback
- `networkDiagnostics.ts` — API 500 / connection failures
- `deploymentDiagnostics.ts` — boot version mismatch
- `initRuntimeDiagnostics.ts` — wired from `main.jsx`

Build metadata (Vite):

- `VITE_APP_COMMIT_SHA`
- `VITE_APP_BUILD_TIME`
- `VITE_ENVIRONMENT`

## Classification examples

### media_cors_blocked

**Symptom:** Video saved to R2, DB has `publicUrl`, but hero stays grey / amber banner.

**Evidence:** `readyState=0`, `networkState=3`, MediaError, console: Cross-Origin Request Blocked / OpaqueResponseBlocking.

**Cursor packet note:** Do not debug upload, DB persistence, or React render branch. Video is saved and element exists. Browser playback is blocked by CDN/R2 CORS.

**Next action:** Fix R2 CORS policy (see below).

### deploy_version_mismatch

**Symptom:** Dashboard deployed on Render; Core still on previous **monorepo** commit — new API routes 404.

**Detection:** On boot, dashboard calls Core `GET {coreBase}/api/runtime/version` (absolute Core URL, not SPA `/api`) and compares baked **parent** `VITE_PARENT_COMMIT_SHA` / `VITE_APP_COMMIT_SHA` to Core `commitSha`. Do not compare dashboard-submodule SHA.

## R2 CORS required config

Apply on the `cardbey-media` bucket (or your CDN origin bucket):

```json
[
  {
    "AllowedOrigins": [
      "https://cardbey.com",
      "https://www.cardbey.com",
      "https://cardbey.onrender.com",
      "https://cardbey-dashboard.onrender.com"
    ],
    "AllowedMethods": ["GET", "HEAD", "OPTIONS"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "Content-Range",
      "Accept-Ranges",
      "ETag"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

See also: [R2_MEDIA_CDN_CORS.md](./R2_MEDIA_CDN_CORS.md)

## Render deployment mismatch

1. Parent static build (`render-dashboard-static-build.mjs`) embeds monorepo `RENDER_GIT_COMMIT` as `VITE_APP_COMMIT_SHA` / `VITE_PARENT_COMMIT_SHA` (optional `VITE_DASHBOARD_COMMIT_SHA` for evidence).
2. Core exposes monorepo `commitSha` on `/api/runtime/version`.
3. Mismatch → diagnostic `deploy_version_mismatch` with both **monorepo** SHAs.

**Ops:** Deploy Core before or with Dashboard when API contracts change. Submodule-only dashboard bumps advance parent SHA; redeploy Core (or accept a real tip mismatch warning) if tips must match.

## Runtime Observations UI

**Live Performance** (platform admin): **Runtime Observations** panel lists recent diagnostics with severity, layer, confidence, next action, and **Copy Cursor packet**.

Cursor packet shape:

```json
{
  "diagnosticId": "…",
  "symptom": "…",
  "classification": "cdn/media_cors_blocked",
  "evidence": {},
  "excludedCauses": ["upload_failure", "db_persistence_failure"],
  "nextAction": "Fix R2 CORS policy…",
  "likelyFiles": ["docs/R2_MEDIA_CDN_CORS.md"],
  "externalActions": ["Update Cloudflare R2 bucket CORS policy"]
}
```

## Privacy and sanitization

- Redacts: Authorization, cookies, API keys, JWTs, presigned query params
- URLs: origin + path only; query stripped except `v`, `retry`, `_retry`
- Truncates large payloads; never stores raw file bytes
- Anonymous ingest: limited fields, rate-limited by IP (60/min)

## Troubleshooting

| User sees | Likely kind | Check |
|-----------|-------------|-------|
| Video saved, CDN playback blocked by CORS | `media_cors_blocked` | R2 CORS + ExposeHeaders |
| Upload failed: backend returned 500… | `storage_upload_failed` | Core logs, R2 credentials |
| Upload connection failed | `upload_connection_failed` | Core URL, Render health |
| Website preview failed to render | `preview_render_crash` | Preview boundary stack |
| Dashboard ahead of core | `deploy_version_mismatch` | Render deploy order |

## Tests

**Core:** `src/routes/__tests__/runtimeDiagnosticsRoute.test.js`, `src/lib/runtimeDiagnostics/__tests__/`

**Dashboard:** `src/lib/runtimeDiagnostics/*.test.ts`
