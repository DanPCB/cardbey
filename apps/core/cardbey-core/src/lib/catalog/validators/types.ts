/**
 * Validator framework types. Not auto-run; call validatePack explicitly.
 */

export type ValidationSeverity = 'WARN' | 'BLOCK';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  itemId?: string;
  field?: string;
  meta?: Record<string, unknown>;
}

/** Rule definition (name, enabled, severity, optional config) */
export interface ValidatorRuleConfig {
  name: string;
  code: string;
  isEnabled: boolean;
  severity: ValidationSeverity;
  configJson?: Record<string, unknown>;
}

/** Item-like shape for validation (catalog fields + categoryKey) */
export interface ItemLike {
  canonicalName?: string;
  type?: string;
  shortDescription?: string;
  tags?: string[];
  defaultCategoryKey?: string;
  categoryKey?: string;
  suggestedPriceMin?: number | null;
  suggestedPriceMax?: number | null;
  imagePrompt?: string | null;
  imageKeywords?: string[] | null;
  businessTypeHints?: string[];
}

/** Pack meta for validation */
export interface PackMetaLike {
  businessType: string;
  region?: string;
}

/** Category-like for price ladder lookup */
export interface CategoryLike {
  key: string;
  label?: string;
}
