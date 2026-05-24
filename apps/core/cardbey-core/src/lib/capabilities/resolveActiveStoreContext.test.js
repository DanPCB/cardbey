import { describe, it, expect } from 'vitest';
import { resolveActiveStoreContext } from './resolveActiveStoreContext.js';

describe('resolveActiveStoreContext', () => {
  it('resolves storeId from currentContext.activeStoreId', () => {
    const ctx = resolveActiveStoreContext({
      currentContext: { activeStoreId: 'store-abc', activeStoreName: 'PTH Furniture' },
    });
    expect(ctx.storeId).toBe('store-abc');
    expect(ctx.storeName).toBe('PTH Furniture');
  });

  it('extracts store name hint from message when id missing', () => {
    const ctx = resolveActiveStoreContext({
      userMessage: 'Create a promotion video for PTH Furniture store',
      currentContext: {},
    });
    expect(ctx.storeId).toBeNull();
    expect(ctx.storeName).toBe('PTH Furniture');
  });
});
