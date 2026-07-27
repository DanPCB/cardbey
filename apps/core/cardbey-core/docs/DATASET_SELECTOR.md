# Dataset Selector

The dataset selector chooses the best **Starter Pack** for a given `(businessType, region)`, optionally applies a **price ladder** to fill missing prices, and optionally runs **validators**. It returns a single **instantiation payload** that store creation can use later.

**This is NOT wired into store creation yet.** It is a pure library. No routes, UI, or onboarding flows call it. Use it only via explicit `selectDataset(...)` calls (e.g. from a future store-generation service or script).

---

## Intended future usage (not implemented yet)

- **Store generation** will call `selectDataset(input, options)` before creating the catalog (e.g. when creating a draft from a template or “start from pack” flow).
- The returned `SelectedDataset` (packMeta, categories, items, optional ladder, optional validation) can be mapped into `DraftStore.preview` or into `Business` + `Product` when the user commits.
- **How store creation will call this (later):** From the draft-store creation path (e.g. `draftStoreService` or a new “create from pack” handler), call `selectDataset({ businessType, region, displayMode }, { applyPriceLadder: true, runValidators: true })`. If `result.validation?.summary.blocks > 0`, either block commit or surface issues in the UI. Then map `result.packMeta`, `result.categories`, and `result.items` into the draft preview JSON shape (or into Prisma creates for Business/Product on commit). Do not implement this wiring until product/feature flag is ready.

---

## Node-only modules (do not import in client)

- **packRegistry** (`dataset/packRegistry.ts`): uses `fs` to list and load JSON files under `data/starter-packs`. For scripts and server only.
- **ladderLoader** (`dataset/ladderLoader.ts`): uses `fs` to load `data/price-ladders/*.json`. For scripts and server only.

Do not import these from client bundles. The public entry point is `dataset/index.ts`, which exports only `selectDataset` and types (and errors). Scripts or server code that need file-based loading will import `selectDataset`; it uses the registry and ladder loader internally.

---

## Example

```ts
import { selectDataset } from './src/lib/catalog/dataset/index.js';

const result = await selectDataset(
  {
    businessType: 'cafe',
    region: 'AU',
    displayMode: 'GRID',
  },
  {
    applyPriceLadder: true,
    runValidators: true,
  }
);

console.log(result.debug.selectedPackId, result.debug.reason);
console.log(result.items.length, result.categories.length);
if (result.validation) {
  console.log('Blocks:', result.validation.summary.blocks, 'Warns:', result.validation.summary.warns);
}
```

With version hint and fallback disabled (strict):

```ts
const result = await selectDataset(
  {
    businessType: 'cafe',
    region: 'au',
    displayMode: 'LIST',
    packVersionHint: '1.0',
    allowFallbackRegion: false,
  },
  { applyPriceLadder: true, runValidators: true }
);
```

---

## Options

- **applyPriceLadder** (default `false`): fill missing `suggestedPriceMin` / `suggestedPriceMax` from the matching price ladder; does not overwrite existing prices.
- **runValidators** (default `false`): run the validator rule set (default: only completeness enabled) and attach `validation.issues` and `validation.summary` to the result. Does not throw on issues; caller decides how to handle blocks/warns.
- **validatorRulesOverride**: optional custom rules (e.g. enable `imageRequired` for GRID). If not set, default rules are used (only completeness enabled by default; safest, no unexpected blocking).

---

## Errors

- **NoStarterPackFoundError**: thrown when no pack matches `(businessType, region)` and either `allowFallbackRegion` is false or there is no pack for that businessType at all.
- **DatasetSelectorConfigError**: reserved for configuration/setup errors.
