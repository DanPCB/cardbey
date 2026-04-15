/**
 * Validators test suite – parsing and rule behavior only; no runtime flow changes.
 */

import { describe, it, expect } from 'vitest';
import {
  validatePack,
  summarizeIssues,
  validateCatalogItems,
  DEFAULT_VALIDATOR_RULES,
  requiredFieldsRule,
  priceSanityRule,
  businessTypeCoherenceRule,
  imageRequiredRule,
} from '../src/lib/catalog/validators/index.js';
import type { ItemLike, CategoryLike, PackMetaLike, ValidatorRuleConfig } from '../src/lib/catalog/validators/types.js';

describe('validators', () => {
  const sampleCategories: CategoryLike[] = [
    { key: 'hot_drinks', label: 'Hot Drinks' },
    { key: 'food', label: 'Food' },
  ];

  const samplePack: PackMetaLike = { businessType: 'cafe', region: 'AU' };

  describe('requiredFieldsRule', () => {
    it('returns no issues when all required fields present', () => {
      const items: ItemLike[] = [
        { canonicalName: 'Flat White', type: 'FOOD', categoryKey: 'hot_drinks' },
      ];
      const rule: ValidatorRuleConfig = { name: 'Required', code: 'requiredFields', isEnabled: true, severity: 'BLOCK', configJson: {} };
      const issues = requiredFieldsRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(0);
    });

    it('blocks when canonicalName missing', () => {
      const items: ItemLike[] = [
        { canonicalName: '', type: 'FOOD', categoryKey: 'hot_drinks' },
      ];
      const rule: ValidatorRuleConfig = { name: 'Required', code: 'requiredFields', isEnabled: true, severity: 'BLOCK', configJson: {} };
      const issues = requiredFieldsRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('requiredFields');
      expect(issues[0].severity).toBe('BLOCK');
      expect(issues[0].field).toBe('canonicalName');
    });

    it('blocks when categoryKey missing', () => {
      const items: ItemLike[] = [
        { canonicalName: 'Flat White', type: 'FOOD' },
      ];
      const rule: ValidatorRuleConfig = { name: 'Required', code: 'requiredFields', isEnabled: true, severity: 'BLOCK', configJson: {} };
      const issues = requiredFieldsRule(items, sampleCategories, samplePack, rule);
      expect(issues.some((i) => i.field === 'categoryKey' || i.field === 'defaultCategoryKey')).toBe(true);
    });

    it('does not run when rule disabled', () => {
      const items: ItemLike[] = [
        { canonicalName: '', type: 'FOOD', categoryKey: 'hot_drinks' },
      ];
      const rule: ValidatorRuleConfig = { name: 'Required', code: 'requiredFields', isEnabled: false, severity: 'BLOCK', configJson: {} };
      const issues = requiredFieldsRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(0);
    });
  });

  describe('priceSanityRule', () => {
    it('warns when price below category min', () => {
      const items: ItemLike[] = [
        { categoryKey: 'hot_drinks', suggestedPriceMin: 2, suggestedPriceMax: 3 },
      ];
      const rule: ValidatorRuleConfig = {
        name: 'Price',
        code: 'priceSanity',
        isEnabled: true,
        severity: 'WARN',
        configJson: { byCategoryKey: { hot_drinks: { min: 4, max: 10 } } },
      };
      const issues = priceSanityRule(items, sampleCategories, samplePack, rule);
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0].code).toBe('priceSanity');
    });

    it('warns when price above category max', () => {
      const items: ItemLike[] = [
        { categoryKey: 'hot_drinks', suggestedPriceMin: 12, suggestedPriceMax: 15 },
      ];
      const rule: ValidatorRuleConfig = {
        name: 'Price',
        code: 'priceSanity',
        isEnabled: true,
        severity: 'WARN',
        configJson: { byCategoryKey: { hot_drinks: { min: 4, max: 10 } } },
      };
      const issues = priceSanityRule(items, sampleCategories, samplePack, rule);
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it('returns no issues when price in range', () => {
      const items: ItemLike[] = [
        { categoryKey: 'hot_drinks', suggestedPriceMin: 5, suggestedPriceMax: 8 },
      ];
      const rule: ValidatorRuleConfig = {
        name: 'Price',
        code: 'priceSanity',
        isEnabled: true,
        severity: 'WARN',
        configJson: { byCategoryKey: { hot_drinks: { min: 4, max: 10 } } },
      };
      const issues = priceSanityRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(0);
    });
  });

  describe('businessTypeCoherenceRule', () => {
    it('blocks when businessTypeHints do not include pack businessType', () => {
      const items: ItemLike[] = [
        { canonicalName: 'X', type: 'FOOD', categoryKey: 'food', businessTypeHints: ['restaurant'] },
      ];
      const rule: ValidatorRuleConfig = { name: 'Coherence', code: 'businessTypeCoherence', isEnabled: true, severity: 'BLOCK', configJson: {} };
      const issues = businessTypeCoherenceRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('businessTypeCoherence');
    });

    it('returns no issues when hints include pack businessType', () => {
      const items: ItemLike[] = [
        { canonicalName: 'X', type: 'FOOD', categoryKey: 'food', businessTypeHints: ['cafe', 'bakery'] },
      ];
      const rule: ValidatorRuleConfig = { name: 'Coherence', code: 'businessTypeCoherence', isEnabled: true, severity: 'BLOCK', configJson: {} };
      const issues = businessTypeCoherenceRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(0);
    });

    it('returns no issues when hints empty (no conflict)', () => {
      const items: ItemLike[] = [
        { canonicalName: 'X', type: 'FOOD', categoryKey: 'food', businessTypeHints: [] },
      ];
      const rule: ValidatorRuleConfig = { name: 'Coherence', code: 'businessTypeCoherence', isEnabled: true, severity: 'BLOCK', configJson: {} };
      const issues = businessTypeCoherenceRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(0);
    });
  });

  describe('imageRequiredRule', () => {
    it('warns when GRID and no imagePrompt/imageKeywords', () => {
      const items: ItemLike[] = [
        { canonicalName: 'X', type: 'FOOD', categoryKey: 'food', imagePrompt: null, imageKeywords: null },
      ];
      const rule: ValidatorRuleConfig = { name: 'Image', code: 'imageRequired', isEnabled: true, severity: 'WARN', configJson: { displayMode: 'GRID' } };
      const issues = imageRequiredRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('imageRequired');
    });

    it('returns no issues when LIST displayMode', () => {
      const items: ItemLike[] = [
        { canonicalName: 'X', type: 'FOOD', categoryKey: 'food', imagePrompt: null, imageKeywords: null },
      ];
      const rule: ValidatorRuleConfig = { name: 'Image', code: 'imageRequired', isEnabled: true, severity: 'WARN', configJson: { displayMode: 'LIST' } };
      const issues = imageRequiredRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(0);
    });

    it('returns no issues when imagePrompt present', () => {
      const items: ItemLike[] = [
        { canonicalName: 'X', type: 'FOOD', categoryKey: 'food', imagePrompt: 'A cup of coffee', imageKeywords: null },
      ];
      const rule: ValidatorRuleConfig = { name: 'Image', code: 'imageRequired', isEnabled: true, severity: 'WARN', configJson: { displayMode: 'GRID' } };
      const issues = imageRequiredRule(items, sampleCategories, samplePack, rule);
      expect(issues).toHaveLength(0);
    });
  });

  describe('validatePack', () => {
    it('runs multiple rules and returns combined issues', () => {
      const items: ItemLike[] = [
        { canonicalName: '', type: 'FOOD', categoryKey: 'hot_drinks' },
        { canonicalName: 'Latte', type: 'FOOD', categoryKey: 'hot_drinks', businessTypeHints: ['restaurant'] },
      ];
      const issues = validatePack({
        pack: samplePack,
        items,
        categories: sampleCategories,
        rules: DEFAULT_VALIDATOR_RULES,
      });
      expect(issues.length).toBeGreaterThanOrEqual(1);
      const summary = summarizeIssues(issues);
      expect(summary.blocks + summary.warns).toBe(issues.length);
      expect(summary.byCode['requiredFields'] ?? 0).toBeGreaterThanOrEqual(0);
    });
  });

  describe('summarizeIssues', () => {
    it('counts blocks and warns and byCode', () => {
      const issues = [
        { severity: 'BLOCK' as const, code: 'requiredFields', message: 'x' },
        { severity: 'BLOCK' as const, code: 'requiredFields', message: 'y' },
        { severity: 'WARN' as const, code: 'priceSanity', message: 'z' },
      ];
      const summary = summarizeIssues(issues);
      expect(summary.blocks).toBe(2);
      expect(summary.warns).toBe(1);
      expect(summary.byCode['requiredFields']).toBe(2);
      expect(summary.byCode['priceSanity']).toBe(1);
    });
  });

  describe('validateCatalogItems', () => {
    it('validates items with rules only (no pack)', () => {
      const items: ItemLike[] = [
        { canonicalName: 'A', type: 'FOOD', categoryKey: 'food' },
        { canonicalName: '', type: 'FOOD', categoryKey: 'food' },
      ];
      const rules: ValidatorRuleConfig[] = [
        { name: 'Required', code: 'requiredFields', isEnabled: true, severity: 'BLOCK', configJson: {} },
      ];
      const issues = validateCatalogItems(items, rules);
      expect(issues).toHaveLength(1);
      expect(issues[0].field).toBe('canonicalName');
    });
  });
});
