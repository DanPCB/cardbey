import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLogoPreviewPatchFromUrl, syncBusinessLogoProfile } from './logoUpdateService.js';

describe('buildLogoPreviewPatchFromUrl', () => {
  it('sets avatar, brand.logoUrl, and meta profile fields', () => {
    const patch = buildLogoPreviewPatchFromUrl('/uploads/logo.png', {
      brand: { name: 'Test' },
    });
    expect(patch.avatarImageUrl).toBe('/uploads/logo.png');
    expect(patch.avatar?.url).toBe('/uploads/logo.png');
    expect(patch.brand?.logoUrl).toBe('/uploads/logo.png');
    expect(patch.meta?.profileAvatarUrl).toBe('/uploads/logo.png');
  });
});

describe('syncBusinessLogoProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates Business.avatarImageUrl and logo JSON', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ logo: '{"bannerUrl":"old"}' }),
        update,
      },
    };

    const ok = await syncBusinessLogoProfile(prisma, 'store-1', '/uploads/new-logo.png');
    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: expect.objectContaining({
        avatarImageUrl: '/uploads/new-logo.png',
        logo: expect.stringContaining('/uploads/new-logo.png'),
      }),
    });
  });
});
