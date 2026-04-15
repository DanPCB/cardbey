/**
 * Dataset selector types. Pure types only; no runtime wiring.
 */

import type { ValidationIssue } from '../validators/types.js';
import type { PriceLadder } from '../priceLadder.js';

export type DisplayMode = 'GRID' | 'LIST' | 'MAGAZINE';

export interface DatasetSelectionInput {
  businessType: string;
  region: string;
  currency?: string;
  displayMode?: DisplayMode;
  /** Optional e.g. "1.0" or "v1" to prefer matching pack version */
  packVersionHint?: string;
  /** If true, allow falling back to same businessType with any region when no exact match */
  allowFallbackRegion?: boolean;
}

export interface ValidatorRuleConfigLike {
  name: string;
  code: string;
  isEnabled: boolean;
  severity: string;
  configJson?: Record<string, unknown>;
}

export interface DatasetSelectionOptions {
  /** Fill missing priceMin/priceMax from price ladder; default false */
  applyPriceLadder?: boolean;
  /** Run validators and attach issues to result; default false */
  runValidators?: boolean;
  /** Optional override for validator rules (e.g. to enable imageRequired for GRID) */
  validatorRulesOverride?: ValidatorRuleConfigLike[];
}

/** Pack meta shape (matches packLoader packMeta). Flexible for selector output. */
export interface PackMetaLike {
  businessType: string;
  region: string;
  version?: string;
  name?: string;
  description?: string | null;
  currency?: string;
  defaultCurrencyCode?: string | null;
  [k: string]: unknown;
}

/** Category shape for instantiation payload */
export interface CategoryLike {
  key: string;
  label: string;
  parentKey?: string | null;
  sortOrder?: number;
  [k: string]: unknown;
}

/** Item shape for instantiation payload (catalog item + join data) */
export interface ItemLike {
  type: string;
  canonicalName: string;
  shortDescription: string;
  longDescription?: string | null;
  tags: string[];
  defaultCategoryKey: string;
  suggestedPriceMin?: number | null;
  suggestedPriceMax?: number | null;
  currencyCode?: string | null;
  imagePrompt?: string | null;
  imageKeywords?: string[] | null;
  modifiersJson?: Record<string, unknown> | null;
  businessTypeHints?: string[];
  localeHints?: string[];
  categoryKey: string;
  sortOrder: number;
  featured: boolean;
  overridesJson?: Record<string, unknown> | null;
  [k: string]: unknown;
}

export interface SelectedDataset {
  packMeta: PackMetaLike;
  categories: CategoryLike[];
  items: ItemLike[];
  ladder?: PriceLadder | null;
  validation?: {
    issues: ValidationIssue[];
    summary: { blocks: number; warns: number; byCode: Record<string, number> };
    rules: ValidatorRuleConfigLike[];
  } | null;
  debug: {
    selectedPackId: string;
    reason: string;
    fallbackUsed: boolean;
  };
}
