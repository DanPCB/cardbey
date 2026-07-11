import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../accountStoreIntakeGate.js', () => ({
  loadAccountStoreContext: vi.fn(),
}));

vi.mock('../intakeMemoryContext.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveIntakeStoreId: vi.fn(),
    resolveIntakeDraftId: vi.fn(),
  };
});

vi.mock('../resolveStoreAmbiguity.js', () => ({
  validateUserStoreId: vi.fn(),
}));

vi.mock('../../runtime/runtimeSessionService.js', () => ({
  resolveLatestStoreTargetForUser: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

import { loadAccountStoreContext } from '../accountStoreIntakeGate.js';
import { resolveIntakeDraftId, resolveIntakeStoreId } from '../intakeMemoryContext.js';
import { validateUserStoreId } from '../resolveStoreAmbiguity.js';
import { resolveLatestStoreTargetForUser } from '../../runtime/runtimeSessionService.js';
import {
  mergePerformerIntakeContextIntoCurrentContext,
  resolvePerformerIntakeContext,
} from '../resolvePerformerIntakeContext.js';

describe('resolvePerformerIntakeContext', () => {
  beforeEach(() => {
    vi.mocked(loadAccountStoreContext).mockReset();
    vi.mocked(resolveIntakeStoreId).mockReset();
    vi.mocked(resolveIntakeDraftId).mockReset();
    vi.mocked(validateUserStoreId).mockReset();
    vi.mocked(resolveLatestStoreTargetForUser).mockReset();
    vi.mocked(resolveIntakeDraftId).mockReturnValue(null);
    vi.mocked(validateUserStoreId).mockImplementation(async (_uid, sid) => Boolean(sid));
  });

  it('auto-binds a single owned store', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 1,
      stores: [{ id: 'store-1', name: 'Only Store' }],
    });
    vi.mocked(resolveIntakeStoreId).mockReturnValue(null);
    vi.mocked(resolveLatestStoreTargetForUser).mockResolvedValue({
      storeId: null,
      draftId: null,
      source: null,
    });

    const result = await resolvePerformerIntakeContext({
      userId: 'user-1',
      currentContext: { spaceType: 'personal', spaceId: 'personal' },
    });

    expect(result.activeStoreId).toBe('store-1');
    expect(result.selectionMethod).toBe('single_owned_store');
    expect(result.hasActiveStoreContext).toBe(true);
  });

  it('uses last-used store for multi-store owners in personal space', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 3,
      stores: [
        { id: 'store-a', name: 'A' },
        { id: 'store-b', name: 'B' },
      ],
    });
    vi.mocked(resolveIntakeStoreId).mockReturnValue(null);
    vi.mocked(resolveLatestStoreTargetForUser).mockResolvedValue({
      storeId: 'store-b',
      draftId: null,
      source: 'latest_store_mission',
    });

    const result = await resolvePerformerIntakeContext({
      userId: 'user-1',
      currentContext: { spaceType: 'personal', spaceId: 'personal' },
    });

    expect(result.activeStoreId).toBe('store-b');
    expect(result.selectionMethod).toBe('latest_store_mission');
    expect(result.spaceType).toBe('personal');
  });

  it('binds performee business space before last-used fallback', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 2,
      stores: [{ id: 'store-a' }, { id: 'store-b' }],
    });
    vi.mocked(resolveIntakeStoreId).mockReturnValue(null);

    const result = await resolvePerformerIntakeContext({
      userId: 'user-1',
      intentSourceContext: {
        performeeContext: { spaceType: 'business', spaceId: 'store-a' },
      },
    });

    expect(result.activeStoreId).toBe('store-a');
    expect(result.selectionMethod).toBe('performee_space');
    expect(resolveLatestStoreTargetForUser).not.toHaveBeenCalled();
  });

  it('merges resolved context into currentContext', () => {
    const merged = mergePerformerIntakeContextIntoCurrentContext(
      { spaceType: 'personal' },
      {
        activeStoreId: 'store-1',
        activeDraftId: null,
        spaceType: 'personal',
        spaceId: 'personal',
        accountHasStores: true,
        accountStoreCount: 2,
        accountStores: [],
        hasActiveStoreContext: true,
        selectionMethod: 'last_used',
      },
    );

    expect(merged.activeStoreId).toBe('store-1');
    expect(merged.storeId).toBe('store-1');
    expect(merged.performerIntakeContext?.selectionMethod).toBe('last_used');
  });
});
