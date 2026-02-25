# Impact Report: Dataset Selector Modules

**Date:** 2026-02-06  
**Scope:** Dataset selector layer (Node-only packs + optional ladders + validators). No runtime/UI wiring.

## Risk assessment (before coding)

| Risk | Mitigation |
|------|------------|
| **Client bundle break** – importing `fs`/`path`/`process` in client | `packRegistry.ts` and `ladderLoader.ts` are Node-only; **not exported** from `src/lib/catalog/dataset/index.ts`. Only `selectDataset`, errors, and public types are exported. |
| **Vite build fail** | Same as above; no client ever imports dataset index with Node modules. |
| **Test env (Vitest)** | Vitest config already uses `environment: 'node'`; dataset selector test file uses `// @vitest-environment node`. Tests run from `apps/core/cardbey-core` so `data/` paths resolve. |
| **Path/case mismatch** | Ladder path: `data/price-ladders/${businessType}_${region}.json` (lowercase). Existing files: `cafe_au.json`, `nails_au.json`. Loader returns `null` for missing file (no throw). |
| **Schema drift** | Reuse `loadPackFromJson` + `validateRawPack` from packLoader; extend only minimally. `NoStarterPackFoundError` thrown when no pack matches. |
| **Accidental runtime integration** | No imports of selector in onboarding/store creation. After implementation: `rg "selectDataset\(" src` limited to dataset module + tests. |

## What could break

- **Nothing in current workflows.** This is additive: new modules under `src/lib/catalog/dataset/`, new doc, new test file. No routes, UI, onboarding, or publish flows are changed.

## Smallest safe approach

- Implement only under `apps/core/cardbey-core/src/lib/catalog/dataset/` and `apps/core/cardbey-core/tests/`; add `docs/DATASET_SELECTOR.md`.
- Do **not** import `packRegistry` or `ladderLoader` from anywhere outside the dataset folder (except inside `selectDataset.ts` and tests that need Node).
- Keep `index.ts` exporting only the public API.

**Proceeding with implementation.**
