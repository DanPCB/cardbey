# Impact Report — Create-store runtime gate Render unblock

## What could break
- Store-creation research agent TypeScript facade removed; only `.js` remains (tsx previously remapped to divergent `.ts`).
- SEO display-name stripping moved to `businessDiscovery/seoDisplayName.runtime.js`; discovery runtime no longer imports `storeCreation`.
- Prestart runs prisma generate before the import-graph gate.

## Why
Render `npm start` / prestart failed `gate:create-store-runtime` under tsx (`resolve:854` / ERR_MODULE_NOT_FOUND) after semantic-precision merge. Smoke truncated the real error; discovery `*.runtime.js` had a new cross-layer import into `storeCreation`, and dual `businessResearchAgent.js`/`.ts` loaded different graphs under tsx.

## Impact scope
- Core boot / Render prestart only
- Store creation research path (JS agent is canonical)
- SEO name stripping behavior unchanged (same function, new leaf module)

## Smallest safe patch
1. Leaf `seoDisplayName.runtime.js` + discovery import
2. Delete divergent `businessResearchAgent.ts`
3. Smoke script: full error summary + relative imports
4. Prisma generate before gate in `render-predeploy.mjs`
