// DANH: store-disambiguation
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as prismaModule from '../../lib/prisma.js';
import { resolveStoreAmbiguity, validateUserStoreId } from '../../lib/intake/resolveStoreAmbiguity.js';

describe('resolveStoreAmbiguity', () => {
  /** @type {import('vitest').MockInstance} */
  let findManyMock;

  beforeEach(() => {
    findManyMock = vi.fn();
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      business: {
        findMany: findManyMock,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('single store user returns null (no clarify)', async () => {
    findManyMock.mockResolvedValue([{ id: 'store-1', name: 'Cafe', type: 'cafe', logo: null }]);

    const result = await resolveStoreAmbiguity({
      userId: 'user-1',
      effectiveStoreId: null,
      intentRequiresStore: true,
      userMessage: 'Setup a loyalty campaign',
    });

    expect(result).toBeNull();
  });

  it('multi-store user with no storeId returns clarify payload', async () => {
    findManyMock.mockResolvedValue([
      { id: 'store-1', name: 'Cafe A', type: 'cafe', logo: null },
      { id: 'store-2', name: 'Cafe B', type: 'cafe', logo: null },
      { id: 'store-3', name: 'Cafe C', type: 'cafe', logo: null },
    ]);

    const result = await resolveStoreAmbiguity({
      userId: 'user-1',
      effectiveStoreId: null,
      intentRequiresStore: true,
      userMessage: 'Setup a loyalty campaign',
    });

    expect(result?.needsClarification).toBe(true);
    expect(result?.clarifyType).toBe('store_picker');
    expect(result?.options).toHaveLength(3);
    expect(result?.pendingIntent?.userMessage).toBe('Setup a loyalty campaign');
  });

  it('multi-store user with storeId already set returns null immediately (no DB call)', async () => {
    const result = await resolveStoreAmbiguity({
      userId: 'user-1',
      effectiveStoreId: 'store-1',
      intentRequiresStore: true,
      userMessage: 'Setup a loyalty campaign',
    });

    expect(result).toBeNull();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('intent does not require store returns null (no DB call)', async () => {
    const result = await resolveStoreAmbiguity({
      userId: 'user-1',
      effectiveStoreId: null,
      intentRequiresStore: false,
      userMessage: 'Hello',
    });

    expect(result).toBeNull();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('user has no stores returns null', async () => {
    findManyMock.mockResolvedValue([]);

    const result = await resolveStoreAmbiguity({
      userId: 'user-1',
      effectiveStoreId: null,
      intentRequiresStore: true,
      userMessage: 'Setup a loyalty campaign',
    });

    expect(result).toBeNull();
  });

  it('prisma throws does not crash and returns null', async () => {
    findManyMock.mockRejectedValue(new Error('db down'));

    const result = await resolveStoreAmbiguity({
      userId: 'user-1',
      effectiveStoreId: null,
      intentRequiresStore: true,
      userMessage: 'Setup a loyalty campaign',
    });

    expect(result).toBeNull();
  });
});

describe('validateUserStoreId', () => {
  /** @type {import('vitest').MockInstance} */
  let findFirstMock;

  beforeEach(() => {
    findFirstMock = vi.fn();
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      business: {
        findFirst: findFirstMock,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when store belongs to user', async () => {
    findFirstMock.mockResolvedValue({ id: 'store-1' });
    await expect(validateUserStoreId('user-1', 'store-1')).resolves.toBe(true);
  });

  it('returns false when store is missing', async () => {
    findFirstMock.mockResolvedValue(null);
    await expect(validateUserStoreId('user-1', 'store-missing')).resolves.toBe(false);
  });
});
