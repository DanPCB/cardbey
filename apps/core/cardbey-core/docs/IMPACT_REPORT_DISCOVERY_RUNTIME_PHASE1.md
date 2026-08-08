# Impact report — Discovery Runtime Phase 1 (extract only)

**Date:** 2026-08-08  
**Scope:** Extract Shared Discovery Runtime behind the existing business Content Discovery Agent. **No URI execution. No schema changes.**

## What could break

1. Cron / Run Now stop invoking business crawl if scheduler wiring regresses.
2. Concurrency/delay semantics drift if `executeWithConcurrency` chunking differs from prior loop.
3. Import cycles if runtime accidentally imports business services.

## Why

`AUDIT_DISCOVERY_RUNTIME_URI_SEPARATION.md` Phase 1: reusable scheduler/session shell must sit behind a pipeline interface before URI tables/pipelines are added.

## Impact scope

- `src/lib/discovery/runtime/**` (new)
- `src/lib/discovery/pipelines/business/**` (new)
- `DiscoveryBatchRunner.js` (use runtime concurrency helper only)
- `DiscoveryScheduler.js` (tick via runtime + registered business pipeline)
- Public exports (`initDiscoveryScheduler`, `runAllActive`, `/api/discovery/*`) unchanged

## Smallest safe patch

1. Pure `executeWithConcurrency` + `runScheduledSession` in runtime (no providers).
2. `BusinessDiscoveryPipeline` wraps existing `runAllActive` / `isDiscoveryLocked`.
3. Boundary tests: runtime sources must not import Unclaimed/PreBuilt/SocialImport/DirectoryCrawler.
4. Behaviour tests for concurrency/delay; no Prisma/schema migrations.
