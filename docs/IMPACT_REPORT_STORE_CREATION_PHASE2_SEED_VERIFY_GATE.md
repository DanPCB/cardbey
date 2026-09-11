# IMPACT REPORT — Store Creation Phase 2: Catalog Seed + Verify Gate + Snapshot IDs

**Date:** 2026-09-11  
**Status:** Ready to implement (awaiting proceed / implementing per explicit task)

## Goals (exact)

1. After `store:catalog_complete` with `itemCount === 0`, vertical-seed catalog → patch draft → `store:catalog_seeded`
2. On verify `criticalOk: false` with `issues` including `products`: set publish block flag + `store:publish_blocked`; publish path returns skip + `store:publish_skipped`
3. `PUBLISH_SNAPSHOT_SAVE` logs populate `missionId` / `storeId` from draft context

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Seed invents catalog over intentional empty | Recovery before complete hid empty; sparse_honest must stay empty | Skip seed when `catalogSource === 'sparse_honest'`; only when itemCount 0 after complete |
| Hard-fail mission on verify | Flag/throw could abort generateDraft | Never throw from verify; only set flag + blackboard |
| `DraftStore.metadataJson` column missing | Schema has no `metadataJson` on DraftStore | Store as `draft.input.metadataJson.publishBlocked` (same shape, no migration) |
| publishDraft return-shape change | Callers expect storeId/slug | Gate in `safePublishGeneratedDraft` return `{ ok:false }`; `publishDraft` throws `PublishDraftError('PUBLISH_BLOCKED')` for API |
| Snapshot log only | missionId already on snapshot but omitted from logTag | Pass snapshot fields into logTag; stamp `preview.meta.missionId` / `input.missionId` when known |

## Impact scope

- `storeCreationBlackboard.js` — post-catalog seed hook; verify → publish_blocked + flag
- `draftStoreService.js` — stamp missionId on preview.meta; stop pre-complete recover (seed moves after complete)
- `recoverEmptyStoreCatalog.js` / helpers — reuse for vertical seed after complete
- `safePublishGeneratedDraft.js` + `publishDraftService.js` — honor publishBlocked
- `publishSnapshotService.js` — logTag missionId/storeId
- `structured_store_build.js` — align soft-block with products publish_blocked

## Explicitly not doing

- UX / new agents / research path / pipeline restructure / schema migration
