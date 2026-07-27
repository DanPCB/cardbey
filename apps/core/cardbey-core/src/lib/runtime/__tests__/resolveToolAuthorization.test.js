/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../toolExecutors/loyalty/loyaltyProgramDraft.js', () => ({
  assertStoreOwnership: vi.fn(async ({ storeId, userId }) => {
    if (!userId) {
      return {
        ok: false,
        blocker: { code: 'AUTH_REQUIRED', message: 'Sign in to set up a loyalty program.' },
      };
    }
    if (!storeId) {
      return {
        ok: false,
        blocker: { code: 'STORE_REQUIRED', message: 'Choose a store before setting up a loyalty campaign.' },
      };
    }
    if (storeId === 'foreign') {
      return {
        ok: false,
        blocker: { code: 'STORE_ACCESS_DENIED', message: 'You do not have access to this store.' },
      };
    }
    return { ok: true, store: { id: storeId, name: 'Owned Store' } };
  }),
}));

import { resolveToolAuthorization } from '../resolveToolAuthorization.js';

describe('resolveToolAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('anonymous principal → sign_in_required', async () => {
    const result = await resolveToolAuthorization({
      principal: { kind: 'anonymous', anonymousSessionId: 'guest_1' },
      storeId: 'store_1',
      tool: 'setup_loyalty_program',
    });
    expect(result.state).toBe('sign_in_required');
    expect(result.canExecute).toBe(false);
  });

  it('authenticated owner + valid store → authorized', async () => {
    const result = await resolveToolAuthorization({
      principal: { kind: 'authenticated', userId: 'user_1' },
      storeId: 'store_1',
      tool: 'setup_loyalty_program',
    });
    expect(result.state).toBe('authorized');
    expect(result.canExecute).toBe(true);
    expect(result.userId).toBe('user_1');
  });

  it('authenticated user + no store → store_selection_required', async () => {
    const result = await resolveToolAuthorization({
      principal: { kind: 'authenticated', userId: 'user_1' },
      storeId: null,
      tool: 'setup_loyalty_program',
    });
    expect(result.state).toBe('store_selection_required');
    expect(result.canExecute).toBe(false);
  });

  it('authenticated non-owner → store_access_denied', async () => {
    const result = await resolveToolAuthorization({
      principal: { kind: 'authenticated', userId: 'user_1' },
      storeId: 'foreign',
      tool: 'setup_loyalty_program',
    });
    expect(result.state).toBe('store_access_denied');
    expect(result.canExecute).toBe(false);
  });
});
