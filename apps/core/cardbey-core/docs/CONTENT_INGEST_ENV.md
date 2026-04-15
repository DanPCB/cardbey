# Content Ingest Dataset Capture — Environment Variables

Dataset capture is **OFF by default**. Retention, sampling, and websiteUrl wipe are gated behind env vars; all optional.

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CONTENT_INGEST_LOGS` | (unset) | Must be `true` or `1` to enable capture. When unset/false, no samples are written and no retention deletes run. |
| `CONTENT_INGEST_RETENTION_DAYS` | `14` | Delete samples older than this many days. Set to `0` to disable retention cleanup. |
| `CONTENT_INGEST_MAX_ROWS_PER_DAY` | `200` | Max new samples per UTC day; excess is skipped (DAILY_CAP). Set to `0` for no cap. |
| `CONTENT_INGEST_SAMPLE_RATE` | `1.0` | Random sampling rate 0..1 (e.g. `0.5` = 50% of eligible captures). |
| `CONTENT_INGEST_WIPE_WEBSITE_URL` | `false` | When `true`, after a successful URL-based build, replace full `websiteUrl` in task.request with domain only. |
| `CONTENT_INGEST_EXPORT_MAX_LIMIT` | `500` | Hard max for `GET /api/dev/content-ingest/export?limit=...`. |

**Export:** `GET /api/dev/content-ingest/export` is only registered when `NODE_ENV !== 'production'` and requires `ENABLE_CONTENT_INGEST_LOGS=true`. Optional: `DEV_ADMIN_TOKEN` + `X-Dev-Admin-Token` header.

**Samples** include `meta.costSource` (`template` \| `free_api` \| `paid_ai`) for analysis.
