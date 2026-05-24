import { describe, it, expect, vi, beforeEach } from 'vitest';

const businessFindUnique = vi.fn();
const businessUpdate = vi.fn();
const buildProjection = vi.fn();
const setBlackboardKey = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    business: {
      findUnique: businessFindUnique,
      update: businessUpdate,
    },
  }),
}));

vi.mock('../../missionBlackboard.js', () => ({
  setBlackboardKey: (...args) => setBlackboardKey(...args),
}));

vi.mock('../../../services/publishedArtifactProjection/publishProjectionHooks.js', () => ({
  buildPersistAndApplyPublishedProjection: (...args) => buildProjection(...args),
}));

import { execute } from './setBusinessSocialLinks.js';

describe('setBusinessSocialLinks executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBlackboardKey.mockResolvedValue({ ok: true });
    buildProjection.mockResolvedValue({});
  });

  it('no-op when no valid URLs provided', async () => {
    const result = await execute(
      { storeId: 'store-1', socialLinks: { instagram: 'not-a-url' } },
      { missionId: 'm-1' },
    );
    expect(result.status).toBe('ok');
    expect(result.output?.noop).toBe(true);
    expect(businessUpdate).not.toHaveBeenCalled();
    expect(setBlackboardKey).not.toHaveBeenCalled();
  });

  it('merges only provided valid networks with existing links', async () => {
    businessFindUnique.mockResolvedValue({
      id: 'store-1',
      userId: 'user-1',
      socialLinks: { facebook: 'https://facebook.com/old' },
      publishedAt: null,
      isActive: true,
    });
    businessUpdate.mockResolvedValue({});

    const result = await execute(
      {
        storeId: 'store-1',
        socialLinks: {
          instagram: 'https://instagram.com/new',
          tiktok: 'bad',
        },
      },
      { missionId: 'm-1' },
    );

    expect(result.status).toBe('ok');
    expect(businessUpdate).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: {
        socialLinks: {
          facebook: 'https://facebook.com/old',
          instagram: 'https://instagram.com/new',
        },
      },
    });
    expect(result.output?.networks).toEqual(['instagram']);
    expect(result.output?.skipped?.length).toBe(1);
  });

  it('rebuilds projection when store is already published', async () => {
    businessFindUnique.mockResolvedValue({
      id: 'store-1',
      userId: 'user-1',
      socialLinks: null,
      publishedAt: new Date('2026-01-01'),
      isActive: true,
    });
    businessUpdate.mockResolvedValue({});

    const result = await execute(
      {
        storeId: 'store-1',
        socialLinks: { whatsapp: 'https://wa.me/61400000000' },
      },
      { missionId: 'm-1' },
    );

    expect(result.output?.projectionRebuilt).toBe(true);
    expect(buildProjection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: 'store-1',
        tenantId: 'user-1',
        source: 'setBusinessSocialLinks',
      }),
    );
  });

  it('writes blackboard entry after successful update', async () => {
    businessFindUnique.mockResolvedValue({
      id: 'store-1',
      userId: 'user-1',
      socialLinks: null,
      publishedAt: null,
      isActive: true,
    });
    businessUpdate.mockResolvedValue({});

    await execute(
      {
        storeId: 'store-1',
        socialLinks: { instagram: 'https://instagram.com/salon' },
      },
      { missionId: 'mission-abc' },
    );

    expect(setBlackboardKey).toHaveBeenCalledWith(
      'mission-abc',
      'business.socialLinks',
      expect.objectContaining({
        networks: ['instagram'],
        socialLinks: { instagram: 'https://instagram.com/salon' },
      }),
      expect.any(Object),
    );
  });
});
