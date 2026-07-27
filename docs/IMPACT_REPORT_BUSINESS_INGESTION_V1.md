# Business Ingestion Foundation (V1) — Impact Report

**Date:** 2026-06-16  
**Scope:** New `businessIngestion` module under `apps/core/cardbey-core/src/lib/businessIngestion/`

## Summary

Adds a source-agnostic bulk ingestion pipeline parallel to the existing user-initiated `businessDiscovery` layer. No changes to existing discovery search/import flows.

## What could break

| Risk | Severity |
|------|----------|
| Optional store publish via `persistStores: true` could create unclaimed Business rows if misconfigured system user | Medium (opt-in only) |
| Admin `/api/business-ingestion/run` could ingest large datasets if exposed without auth | Low (requires `requireSuperAdmin`) |
| JSON seed store on disk could grow large | Low (operational) |

## Why

- New routes mounted at `/api/business-ingestion/*`
- Optional `seedStorePersistence` calls existing `safePublishGeneratedDraft` when `persistStores: true`
- Reuses `businessDataNormalizer` phone/website helpers (read-only imports)

## Impact scope

- **Affected:** New admin ingestion API, new test suite, new `data/businessIngestion/` JSON store
- **Not affected:** Owner-created stores, ghost store consumer capture, businessDiscovery search/import, draft generation for owners, campaigns, payments

## Smallest safe patch (implemented)

1. New isolated module with adapter interface and pipeline — no edits to `businessDiscovery/index.ts`
2. Store creation is **opt-in** (`persistStores: false` by default)
3. Seed records persist to separate JSON file (`BUSINESS_INGESTION_DIR`), not Prisma `Business`
4. Admin routes gated with `requireSuperAdmin`
5. Acceptance test runs fully hermetic with local fixture (no external network)

## Rollback

Remove `businessIngestionRoutes` from `server.js` and delete `src/lib/businessIngestion/`. No schema migration required.
