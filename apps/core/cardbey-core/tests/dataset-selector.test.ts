/**
 * Dataset selector tests. Node-only (fs used by packRegistry/ladderLoader).
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { selectDataset, NoStarterPackFoundError } from '../src/lib/catalog/dataset/index.js';
import { validatePack, summarizeIssues } from '../src/lib/catalog/validators/validatePack.js';
import type { ValidatorRuleConfig } from '../src/lib/catalog/validators/types.js';

describe('dataset selector', () => {
  it('exact match returns correct pack for cafe+AU', async () => {
    const result = await selectDataset({ businessType: 'cafe', region: 'AU' });
    expect(result.packMeta.businessType).toBe('cafe');
    expect(result.packMeta.region).toBe('AU');
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.debug.fallbackUsed).toBe(false);
    expect(result.debug.reason).toContain('Exact match');
  });

  it('exact match returns correct pack for nail_salon+AU', async () => {
    const result = await selectDataset({ businessType: 'nail_salon', region: 'AU' });
    expect(result.packMeta.businessType).toBe('nail_salon');
    expect(result.packMeta.region).toBe('AU');
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.debug.fallbackUsed).toBe(false);
  });

  it('version hint "1.0" does not crash and returns something valid', async () => {
    const result = await selectDataset(
      { businessType: 'cafe', region: 'au', packVersionHint: '1.0' }
    );
    expect(result.packMeta.businessType).toBe('cafe');
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.debug.selectedPackId).toBeTruthy();
  });

  it('applyPriceLadder=true sets result.ladder and does not overwrite existing prices', async () => {
    const result = await selectDataset(
      { businessType: 'cafe', region: 'au' },
      { applyPriceLadder: true }
    );
    expect(result.ladder).toBeDefined();
    expect(result.ladder).not.toBeNull();
    const flatWhite = result.items.find(
      (i) => i.canonicalName && i.canonicalName.toLowerCase().includes('flat white')
    );
    expect(flatWhite).toBeDefined();
    if (flatWhite) {
      expect(flatWhite.suggestedPriceMin).toBe(4.5);
      expect(flatWhite.suggestedPriceMax).toBe(6);
    }
  });

  it('runValidators=true attaches validation and summary', async () => {
    const result = await selectDataset(
      { businessType: 'cafe', region: 'au' },
      { runValidators: true }
    );
    expect(result.validation).toBeDefined();
    expect(result.validation!.issues).toBeDefined();
    expect(Array.isArray(result.validation!.issues)).toBe(true);
    expect(result.validation!.summary).toBeDefined();
    expect(typeof result.validation!.summary.blocks).toBe('number');
    expect(typeof result.validation!.summary.warns).toBe('number');
    expect(result.validation!.summary.byCode).toBeDefined();
    expect(result.validation!.rules).toBeDefined();
    expect(result.validation!.rules.length).toBeGreaterThan(0);
  });

  it('missing canonicalName triggers completeness issues via validatePack', () => {
    const rules: ValidatorRuleConfig[] = [
      { name: 'Required fields', code: 'requiredFields', isEnabled: true, severity: 'BLOCK', configJson: {} },
    ];
    const items = [
      {
        canonicalName: '',
        type: 'FOOD',
        categoryKey: 'drinks',
        defaultCategoryKey: 'drinks',
      },
    ] as any;
    const issues = validatePack({
      pack: { businessType: 'cafe', region: 'AU' },
      items,
      categories: [{ key: 'drinks', label: 'Drinks' }],
      rules,
    });
    const summary = summarizeIssues(issues);
    expect(issues.some((i) => i.code === 'requiredFields' && i.field === 'canonicalName')).toBe(true);
    expect(summary.blocks).toBeGreaterThan(0);
  });

  it('allowFallbackRegion=false and region not found throws NoStarterPackFoundError', async () => {
    await expect(
      selectDataset({ businessType: 'cafe', region: 'XX', allowFallbackRegion: false })
    ).rejects.toThrow(NoStarterPackFoundError);
    await expect(
      selectDataset({ businessType: 'cafe', region: 'XX', allowFallbackRegion: false })
    ).rejects.toMatchObject({ businessType: 'cafe', region: 'XX' });
  });

  it('allowFallbackRegion=true uses fallback and sets debug.fallbackUsed=true', async () => {
    const result = await selectDataset({
      businessType: 'cafe',
      region: 'XX',
      allowFallbackRegion: true,
    });
    expect(result.debug.fallbackUsed).toBe(true);
    expect(result.packMeta.businessType).toBe('cafe');
    expect(result.debug.reason).toContain('Fallback');
  });

  it('currency mismatch does not throw and sets debug.reason to mention mismatch', async () => {
    const result = await selectDataset({
      businessType: 'cafe',
      region: 'au',
      currency: 'USD',
    });
    expect(result.debug.reason).toMatch(/currency|differs|AUD|USD/i);
  });
});
