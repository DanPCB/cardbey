/**
 * Dataset selector – public API only. Do NOT wire into store creation.
 * Export selectDataset and types; do not export packRegistry/ladderLoader (Node-only).
 */

export { selectDataset } from './selectDataset.js';
export { NoStarterPackFoundError, DatasetSelectorConfigError } from './errors.js';
export type {
  DisplayMode,
  DatasetSelectionInput,
  DatasetSelectionOptions,
  SelectedDataset,
  PackMetaLike,
  CategoryLike,
  ItemLike,
  ValidatorRuleConfigLike,
} from './types.js';
