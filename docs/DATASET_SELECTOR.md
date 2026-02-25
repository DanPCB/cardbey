# Dataset Selector

The dataset selector layer picks a starter pack by **businessType** and **region**, with optional price ladder application and catalog validators. It is **not wired into store creation or UI**; use it explicitly from scripts or future backend flows.

## Node-only modules (do not import from client)

- **packRegistry.ts** and **ladderLoader.ts** use Node `fs` and `path`. They must **never** be imported from client bundles (Vite/app runtime). Only the public API from `src/lib/catalog/dataset/index.ts` is safe to use from shared or client code.

## Public API

- **selectDataset(input, options?)** – returns a `Promise<SelectedDataset>`.
- **NoStarterPackFoundError**, **DatasetSelectorConfigError** – errors thrown when no pack is found or config is invalid.
- Types: **DisplayMode**, **DatasetSelectionInput**, **DatasetSelectionOptions**, **SelectedDataset**, **PackMetaLike**, **CategoryLike**, **ItemLike**, **ValidatorRuleConfigLike**.

## Example usage

```ts
import { selectDataset } from '@cardbey/core/src/lib/catalog/dataset'; // or your path

const result = await selectDataset(
  { businessType: "cafe", region: "au", displayMode: "GRID" },
  { applyPriceLadder: true, runValidators: true }
);

console.log(result.packMeta.businessType); // "cafe"
console.log(result.debug.selectedPackId);  // e.g. "cafe/au/1.0/Cafe Australia Starter"
console.log(result.debug.fallbackUsed);    // false
if (result.validation) {
  console.log(result.validation.summary.blocks, result.validation.summary.warns);
}
```

## Future

Store creation will call the selector later to choose a starter pack for new stores. No implementation of that wiring is in place yet.
