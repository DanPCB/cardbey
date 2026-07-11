import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateContext, resolveStoreOwnerUserId } from '../context/ContextEvaluator.js';

vi.mock('../../lib/intake/accountStoreIntakeGate.js', () => ({
  loadAccountStoreContext: vi.fn(),
  buildPerformerStoreSelectionClarify: vi.fn(),
}));

import { loadAccountStoreContext } from '../../lib/intake/accountStoreIntakeGate.js';

describe('ContextEvaluator', () => {
  beforeEach(() => {
    vi.mocked(loadAccountStoreContext).mockReset();
    process.env.DEEPSEEK_TOOL_CALLING_ENABLED = 'false';
  });

  it('resolveStoreOwnerUserId prefers ownerUserId over guest actor id', () => {
    expect(
      resolveStoreOwnerUserId({
        message: 'hi',
        userId: 'guest_abc',
        ownerUserId: 'user-real-123',
      }),
    ).toBe('user-real-123');
  });

  it('resolveStoreOwnerUserId rejects guest actor ids', () => {
    expect(
      resolveStoreOwnerUserId({
        message: 'hi',
        userId: 'guest_abc',
      }),
    ).toBeNull();
  });

  it('loads stores for authenticated owner on campaign intent', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 5,
      stores: [
        { id: 's1', name: 'A' },
        { id: 's2', name: 'B' },
        { id: 's3', name: 'C' },
        { id: 's4', name: 'D' },
        { id: 's5', name: 'E' },
      ],
    });

    const result = await evaluateContext(
      {
        type: 'create_campaign',
        requiresBusiness: true,
        confidence: 0.9,
        shouldExecute: true,
      },
      {
        message: 'create a campaign',
        ownerUserId: 'user-authed-1',
        userId: 'guest_should_not_be_used',
      },
    );

    expect(loadAccountStoreContext).toHaveBeenCalledWith('user-authed-1');
    expect(result.status).toBe('needs_store_picker');
    expect(result.storeCount).toBe(5);
  });

  it('auto-selects when owner has one store', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 1,
      stores: [{ id: 'store-abc', name: 'My Cafe' }],
    });

    const result = await evaluateContext(
      {
        type: 'create_campaign',
        requiresBusiness: true,
        confidence: 0.9,
        shouldExecute: true,
      },
      { message: 'create a campaign', ownerUserId: 'user-1' },
    );

    expect(result.status).toBe('ready');
    expect(result.storeId).toBe('store-abc');
  });
});
