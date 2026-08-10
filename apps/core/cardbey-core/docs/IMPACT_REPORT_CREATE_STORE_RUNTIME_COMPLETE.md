# Deliverables: production MODULE_NOT_FOUND create-store fix (complete)

## Exact missing module (production)

After PR #33 (businessDiscovery JS siblings), live still failed after `✓ Store input reviewed`.

**Observed / reproduced under plain Node ESM:**

`Cannot find module '.../resolveCanonicalBusinessLocation.js'`
imported from `applyCanonicalLocation.ts`

Called from `draftStoreService.js` via dynamic import **after** Store input reviewed, **outside** research fail-open.

UI truncated this to **“Cannot find mod...”**.

Prior PR #33 missing modules (also real, earlier in the graph):

- `businessDataNormalizer.js`
- `businessEntityResolver.js`
- `businessDiscoverySources.js` (plus extensionless import)

## Why tests previously passed

1. Vitest/tsx remaps `.js` → `.ts`, masking missing JS siblings.
2. Research MODULE_NOT_FOUND is fail-open; the location import is **not**.
3. Local Node 22 may strip types for some `.ts` files while still failing on nested `.js`-only specs.

## Canonical runtime strategy

| Module | Strategy |
|--------|----------|
| `businessDiscovery/*` helpers | **Canonical `*.runtime.js`**, thin `*.js` + TS facades re-export runtime |
| `location/*` | Same (`*.runtime.js` + facades) |

### Deploy failure after #35 (tsx cycle)

`tsx/esm` remaps `import './foo.js'` → `foo.ts`. Facades that re-exported `./foo.js` created:

`foo.ts → foo.js → foo.ts` → `SyntaxError: Detected cycle while resolving name …`

Fix: facades/entries re-export `./foo.runtime.js` only (different basename).

## Imports corrected

- `draftStoreService.js` → `applyCanonicalLocation.js`
- `orchestraBuildStore.js` → `resolveCanonicalBusinessLocation.js`
- `publishDraftService.js` → location `.js`
- `generateFullStoreFromSeedService.ts` → `applyCanonicalLocation.js`
- `businessResearchAgent.js/.ts` → `businessDiscoverySources.js` (already from #33)

## Files changed (this patch)

- `src/lib/businessDiscovery/*.ts` → facades
- `src/lib/location/*.js` (new) + `*.ts` facades
- `src/services/draftStore/draftStoreService.js`
- `src/services/draftStore/orchestraBuildStore.js`
- `src/services/draftStore/publishDraftService.js`
- `src/lib/businessIngestion/generateFullStoreFromSeedService.ts`
- `src/lib/toolExecutors/store/structured_store_build.js` (safe failure codes)
- `src/lib/toolDispatcher.js` (`tool.dispatch.failed`)
- Smoke + classify + e2e tests; `scripts/smoke-create-store-runtime-graph.mjs`
- `package.json` script `smoke:create-store-runtime`

## Customer-safe failure behaviour

- Step error `message`: `We couldn't finish preparing your store draft.`
- Internal code: `STORE_BUILD_RUNTIME_DEPENDENCY_MISSING` for module resolution
- Developer fields: `developerMessage` / `developerCode` (logs / task result)
- Mission title unchanged (still Create store: …)

## Startup

| | Before | After |
|--|--------|--------|
| Web/staging start | `node ... --import tsx/esm src/server.js` | unchanged (additive) |
| Create-store research/location graph | required TS remapping | loads under **plain Node ESM** |

Worker: no separate worker service in `render.yaml` — same `npm start` web process.

## Flag

Keep `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW` **off** on first production soak after this deploy; module graph loads independently of the flag.

## Validation commands

```bash
cd apps/core/cardbey-core
node scripts/smoke-create-store-runtime-graph.mjs
npm test -- createStoreRuntimeGraph
npm test -- classifyGenerateDraftFailure
npm test -- createStoreResearchRuntime
npm test -- researchCatalogDraft
npm test -- storeCreationResearch
npm test -- structured_store_build
```
