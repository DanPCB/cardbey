/**
 * Catalog validators – quality gates for packs and items.
 * Do not attach to store creation; call validatePack explicitly.
 */

export * from './types.js';
export * from './rules.js';
export * from './defaultRules.js';
export { validatePack, summarizeIssues, validateCatalogItems } from './validatePack.js';
export type { ValidatePackParams, SummarizeIssuesResult } from './validatePack.js';
