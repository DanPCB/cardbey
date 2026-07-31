# Impact report: Live create-store `Cannot find mod...`

## Observed

- Mission console Current Goal shows truncated Node error `Cannot find mod...` (`MODULE_NOT_FOUND`).
- History stops near `tool.dispatch.started`; chat already claimed setup kicked off.
- Reproduced locally without tsx:
  `Cannot find module '.../businessDiscoverySources' imported from businessResearchAgent.js`

## Root cause

`structured_store_build` → `draftStoreService` statically imports `storeCreationResearch`, which imports TS-only `businessDiscovery/*` files as `.js` (and one extensionless path). On Render, when the TS loader does not resolve those files, generateDraft fails with `GENERATE_DRAFT_FAILED` and that message becomes Current Goal.

## What could break

1. Research / Places path if JS ports diverge from TS.
2. Any TS-only consumers that expected exclusive `.ts` ownership (low risk if `.ts` re-exports `.js`).

## Impact scope

Performer create-store / `structured_store_build` on live and staging (core API).

## Smallest safe patch

1. Add pure-JS siblings for `businessDataNormalizer`, `businessEntityResolver`, `businessSourceAttribution`, `businessDiscoverySources`.
2. Point `.ts` files at the JS implementations (re-export) to keep a single runtime source.
3. Fix extensionless import in `businessResearchAgent.js`.
4. Verify `import('./src/lib/storeCreationResearch/index.js')` succeeds under plain Node.
