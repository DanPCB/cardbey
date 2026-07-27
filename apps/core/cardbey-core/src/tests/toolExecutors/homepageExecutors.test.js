// DANH: skill-round4-feature
import { describe, it, expect } from 'vitest';
import {
  matchProductFromMessage,
  execute as identifyFeatureTarget,
} from '../../lib/toolExecutors/homepage/identify_feature_target.js';
import { execute as applyHomepageFeature } from '../../lib/toolExecutors/homepage/apply_homepage_feature.js';

describe('homepage executors', () => {
  it('matchProductFromMessage prefers named match', () => {
    const products = [
      { id: '1', name: 'Chocolate Cake', description: 'Rich' },
      { id: '2', name: 'Latte', description: 'Coffee' },
    ];
    const { product, matchMethod } = matchProductFromMessage('feature the chocolate cake', products);
    expect(product?.id).toBe('1');
    expect(matchMethod).toBe('named');
  });

  it('matchProductFromMessage falls back to recent', () => {
    const products = [{ id: '9', name: 'Tea', description: null }];
    const { matchMethod } = matchProductFromMessage('pin this', products);
    expect(matchMethod).toBe('recent');
  });

  it('identify_feature_target does not throw without storeId', async () => {
    await expect(identifyFeatureTarget({})).resolves.toMatchObject({ status: 'failed' });
  });

  // DANH: schema-gap-product-featured — isFeatured wired; missing row returns honest failure
  it('apply_homepage_feature returns not-found when product missing', async () => {
    const result = await applyHomepageFeature({ storeId: 's1', productId: 'p1' });
    expect(result.status).toBe('ok');
    expect(result.output.featured).toBe(false);
    expect(result.output.persisted).toBe(false);
    expect(String(result.output.reason ?? '')).toMatch(/not found|Record/i);
  });
});
