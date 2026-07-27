/**
 * validatePack(pack, items, categories, rules) -> issues[]
 * summarizeIssues(issues) -> { blocks, warns, byCode }
 * Not attached to store creation; manually callable.
 */

import type { ValidationIssue, ValidatorRuleConfig, ItemLike, PackMetaLike, CategoryLike } from './types.js';
import { RULE_RUNNERS } from './rules.js';

export interface ValidatePackParams {
  pack: PackMetaLike;
  items: ItemLike[];
  categories: CategoryLike[];
  rules: ValidatorRuleConfig[];
  itemIdResolver?: (item: ItemLike, index: number) => string | undefined;
}

/**
 * Run all enabled rules and return flat list of issues.
 */
export function validatePack(params: ValidatePackParams): ValidationIssue[] {
  const { pack, items, categories, rules, itemIdResolver } = params;
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    const runner = RULE_RUNNERS[rule.code];
    if (!runner) continue;
    const result = runner(items, categories, pack, rule, itemIdResolver);
    issues.push(...result);
  }
  return issues;
}

export interface SummarizeIssuesResult {
  blocks: number;
  warns: number;
  byCode: Record<string, number>;
}

/**
 * Summarize issues by severity and by code.
 */
export function summarizeIssues(issues: ValidationIssue[]): SummarizeIssuesResult {
  let blocks = 0;
  let warns = 0;
  const byCode: Record<string, number> = {};
  for (const i of issues) {
    if (i.severity === 'BLOCK') blocks += 1;
    else warns += 1;
    byCode[i.code] = (byCode[i.code] ?? 0) + 1;
  }
  return { blocks, warns, byCode };
}

/**
 * Pure function: validate items with rules only (no pack/categories).
 * Use for item-level checks; priceSanity and businessTypeCoherence need pack/categories in validatePack.
 */
export function validateCatalogItems(
  items: ItemLike[],
  rules: ValidatorRuleConfig[],
  itemIdResolver?: (item: ItemLike, index: number) => string | undefined
): ValidationIssue[] {
  return validatePack({
    pack: {},
    items,
    categories: [],
    rules,
    itemIdResolver,
  });
}
