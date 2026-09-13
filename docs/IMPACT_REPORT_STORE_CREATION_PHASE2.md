# IMPACT REPORT — Store Creation Phase 2 (catalog / media / publish / verify)

**Date:** 2026-09-11  
**Status:** Implement after Phase 1 blackboard visibility proven

## Goals

1. Catalog: one recovery when `itemCount === 0` (ensure/seed), not sparse_honest  
2. Media: seed image fallback when hero still null after hero gen (structured path)  
3. Publish: one automatic retry when `safePublishGeneratedDraft` returns `retryable: true`  
4. Verify: expand critical-field check; soft-block auto-publish only (draft stays `ready` for brand checkpoint)

## What could break

| Risk | Mitigation |
|------|------------|
| Force-fill sparse catalogs | Skip when `catalogSource === 'sparse_honest'` |
| Blocking verify fails whole pipeline | Never throw from generateDraft; only skip auto-publish |
| Double guest publish retry | Auth path only; guest already has own retry |
| Seed images wrong category | Reuse existing `getSeedImageForCategory` |

## Impact scope

- `draftStoreService.js` — catalog recovery helper at 4 call sites; verify payload richer  
- `structured_store_build.js` — hero seed fallback; publish retry; pre-publish critical gate  
- `storeCreationBlackboard.js` — richer verify event fields  

## Explicitly not doing

- Agent wrapping / UX rewrite / DraftStore schema / campaign code / research rebuild
