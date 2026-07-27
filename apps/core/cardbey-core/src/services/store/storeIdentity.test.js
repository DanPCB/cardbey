import { describe, it, expect } from 'vitest';
import { resolveStoreWriteMode, isExplicitStoreId } from './storeIdentity.js';

describe('storeIdentity', () => {
  it('isExplicitStoreId rejects temp and draft', () => {
    expect(isExplicitStoreId('temp')).toBe(false);
    expect(isExplicitStoreId('draft')).toBe(false);
    expect(isExplicitStoreId('biz_abc')).toBe(true);
  });

  it('greenfield draft resolves to create', () => {
    const mode = resolveStoreWriteMode({ draft: { committedStoreId: null } });
    expect(mode.mode).toBe('create');
    expect(mode.storeId).toBeNull();
  });

  it('committed draft resolves to update', () => {
    const mode = resolveStoreWriteMode({ draft: { committedStoreId: 'store-a' } });
    expect(mode.mode).toBe('update');
    expect(mode.storeId).toBe('store-a');
  });

  it('explicit target resolves to update', () => {
    const mode = resolveStoreWriteMode({
      draft: { committedStoreId: null },
      targetStoreId: 'store-b',
    });
    expect(mode.mode).toBe('update');
    expect(mode.storeId).toBe('store-b');
  });
});
