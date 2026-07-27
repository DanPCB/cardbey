/**
 * Validator rules: required fields, price sanity, business-type coherence, image required.
 * Pure functions; do not run automatically.
 */

import type { ValidationIssue, ValidatorRuleConfig, ItemLike, PackMetaLike, CategoryLike } from './types.js';

function blockOrWarn(severity: 'WARN' | 'BLOCK', code: string, message: string, itemId?: string, field?: string): ValidationIssue {
  return { severity, code, message, itemId, field };
}

/** Blocks if missing canonicalName, category/type */
export function requiredFieldsRule(
  items: ItemLike[],
  _categories: CategoryLike[],
  _pack: PackMetaLike,
  rule: ValidatorRuleConfig,
  itemIdResolver?: (item: ItemLike, index: number) => string | undefined
): ValidationIssue[] {
  if (!rule.isEnabled) return [];
  const issues: ValidationIssue[] = [];
  const categoryKeyField = 'categoryKey';
  const defaultCategoryKeyField = 'defaultCategoryKey';
  items.forEach((item, index) => {
    const id = itemIdResolver?.(item, index);
    if (!item.canonicalName || String(item.canonicalName).trim() === '') {
      issues.push(blockOrWarn(rule.severity as 'WARN' | 'BLOCK', rule.code, 'Missing canonicalName', id, 'canonicalName'));
    }
    const catKey = item.categoryKey ?? item.defaultCategoryKey;
    if (catKey == null || String(catKey).trim() === '') {
      issues.push(blockOrWarn(rule.severity as 'WARN' | 'BLOCK', rule.code, 'Missing category (categoryKey/defaultCategoryKey)', id, categoryKeyField));
    }
    if (!item.type || String(item.type).trim() === '') {
      issues.push(blockOrWarn(rule.severity as 'WARN' | 'BLOCK', rule.code, 'Missing type', id, 'type'));
    }
  });
  return issues;
}

/** Warns if price outside pack ladder (configJson.byCategoryKey: { key: { min, max } }) */
export function priceSanityRule(
  items: ItemLike[],
  categories: CategoryLike[],
  _pack: PackMetaLike,
  rule: ValidatorRuleConfig,
  itemIdResolver?: (item: ItemLike, index: number) => string | undefined
): ValidationIssue[] {
  if (!rule.isEnabled) return [];
  const config = rule.configJson ?? {};
  const byCategoryKey = (config.byCategoryKey as Record<string, { min?: number; max?: number }>) ?? {};
  const issues: ValidationIssue[] = [];
  const catKeys = new Set(categories.map((c) => c.key));
  items.forEach((item, index) => {
    const id = itemIdResolver?.(item, index);
    const catKey = item.categoryKey ?? item.defaultCategoryKey;
    if (catKey == null) return;
    const ladder = byCategoryKey[catKey];
    if (!ladder) return;
    const min = item.suggestedPriceMin ?? item.suggestedPriceMax;
    const max = item.suggestedPriceMax ?? item.suggestedPriceMin;
    if (typeof ladder.min === 'number' && min != null && min < ladder.min) {
      issues.push(blockOrWarn(rule.severity as 'WARN' | 'BLOCK', rule.code, `Price ${min} below category minimum ${ladder.min}`, id, 'suggestedPriceMin'));
    }
    if (typeof ladder.max === 'number' && max != null && max > ladder.max) {
      issues.push(blockOrWarn(rule.severity as 'WARN' | 'BLOCK', rule.code, `Price ${max} above category maximum ${ladder.max}`, id, 'suggestedPriceMax'));
    }
  });
  return issues;
}

/** Blocks if item tags/hints conflict with pack businessType (basic heuristic) */
export function businessTypeCoherenceRule(
  items: ItemLike[],
  _categories: CategoryLike[],
  pack: PackMetaLike,
  rule: ValidatorRuleConfig,
  itemIdResolver?: (item: ItemLike, index: number) => string | undefined
): ValidationIssue[] {
  if (!rule.isEnabled) return [];
  const packType = pack.businessType?.trim().toLowerCase();
  if (!packType) return [];
  const issues: ValidationIssue[] = [];
  items.forEach((item, index) => {
    const hints = item.businessTypeHints ?? [];
    const hasMatch = hints.some((h) => String(h).trim().toLowerCase() === packType);
    if (!hasMatch && hints.length > 0) {
      const id = itemIdResolver?.(item, index);
      issues.push(blockOrWarn(rule.severity as 'WARN' | 'BLOCK', rule.code, `Item businessTypeHints [${hints.join(', ')}] do not include pack businessType "${pack.businessType}"`, id, 'businessTypeHints'));
    }
  });
  return issues;
}

/** Based on displayMode: GRID requires imagePrompt or imageKeywords; LIST does not */
export function imageRequiredRule(
  items: ItemLike[],
  _categories: CategoryLike[],
  _pack: PackMetaLike,
  rule: ValidatorRuleConfig,
  itemIdResolver?: (item: ItemLike, index: number) => string | undefined
): ValidationIssue[] {
  if (!rule.isEnabled) return [];
  const config = rule.configJson ?? {};
  const displayMode = (config.displayMode as string) ?? 'GRID';
  if (displayMode.toUpperCase() === 'LIST') return [];
  const issues: ValidationIssue[] = [];
  items.forEach((item, index) => {
    const hasPrompt = item.imagePrompt != null && String(item.imagePrompt).trim() !== '';
    const hasKeywords = Array.isArray(item.imageKeywords) && item.imageKeywords.length > 0;
    if (!hasPrompt && !hasKeywords) {
      const id = itemIdResolver?.(item, index);
      issues.push(blockOrWarn(rule.severity as 'WARN' | 'BLOCK', rule.code, 'GRID displayMode requires imagePrompt or imageKeywords', id));
    }
  });
  return issues;
}

export const RULE_RUNNERS: Record<string, (items: ItemLike[], categories: CategoryLike[], pack: PackMetaLike, rule: ValidatorRuleConfig, itemId?: (item: ItemLike, index: number) => string | undefined) => ValidationIssue[]> = {
  requiredFields: requiredFieldsRule,
  priceSanity: priceSanityRule,
  businessTypeCoherence: businessTypeCoherenceRule,
  imageRequired: imageRequiredRule,
};
