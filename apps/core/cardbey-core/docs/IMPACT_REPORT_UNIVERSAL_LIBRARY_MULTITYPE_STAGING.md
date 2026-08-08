# Impact Report — Universal Library multi-type staging expansion

**Date:** 2026-08-08  
**Scope:** Staging-first catalogue expansion beyond still images (video first). Audio deferred.

## What could break

1. **Staging catalogue composition** — re-running bootstrap may publish additional Pexels **videos** (REFERENCE) and more images if `--limit` raised; existing rows stay (idempotent skip-existing).
2. **Pexels rate / quota** — larger bounded sync than prior `--limit=16` image-only runs.
3. **Library UI filters** — `/library` type chips may show Video once Core returns `type=video`; no Dashboard contract change required if discovery flag already ON.
4. **False expectation of audio/templates** — audio and true template payloads are **not** added; Originals HOSTED mp4s still need Core `public/videos` binaries (not in this patch).

## Why

Default staging bootstrap used `maxPublish=16` against image-first `PEXELS_CURATED_QUERIES`, so video queries never ran. Type system already supports video/audio/template; public shelf stayed image-heavy.

## Impact scope

- Core script: `scripts/staging-ul-bootstrap.mjs`
- Core helper: `pexelsLibrarySync.js` (`buildBoundedPexelsQueries`)
- Ops: re-run bootstrap on staging after deploy (fixtures + scheduled sync remain OFF)
- Main: same focused port after staging proof (optional follow-up)

## Smallest safe patch

1. Add `buildBoundedPexelsQueries({ maxPublish, videoReserve })` — **videos first**, then images within budget.
2. Bootstrap defaults: `--limit=24`, `--video-reserve=6`; pass built queries into `runPexelsLibrarySync`.
3. Snapshot `byType` for ops proof.
4. **Audio:** defer — no UL audio provider sync; fixture audio stays fail-closed.
5. **Originals videos:** keep skip-on-missing; do not commit large binaries in this PR. Pexels REFERENCE videos fill the Video shelf for staging.

## Explicit non-goals

- Public fixtures / scheduled provider sync
- Pixabay/Mixkit audio into UL without rights pipeline
- Full staging→main merge of unrelated WIP
- Editable storefront template payloads (preview JPG “templates” unchanged)

## Ops after merge (staging)

```bash
# on staging Core (flags already as UL staging + ENABLE_FIRST_EXTERNAL_PROVIDER_V1)
node scripts/staging-ul-bootstrap.mjs --provider=pexels --limit=24 --video-reserve=6
# expect catalogue snapshot byType.video >= 1 (target ~6) and publicReal > prior
```

## No-parallel-stack proof

Uses existing `runPexelsLibrarySync` + Originals import + `UniversalAsset` only. No new catalogue stack, no Dashboard in-memory seed, no fixture seed path.
