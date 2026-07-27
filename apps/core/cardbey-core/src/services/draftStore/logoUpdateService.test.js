import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyCheckpointLogoToDraft,
  buildLogoPreviewPatchFromUrl,
  hasUserUploadedLogo,
  syncBusinessLogoProfile,
} from './logoUpdateService.js';

vi.mock('./draftStoreService.js', () => ({
  getDraft: vi.fn().mockResolvedValue({ id: 'draft-1', preview: {} }),
  patchDraftPreview: vi.fn().mockResolvedValue({}),
}));

vi.mock('./publishSnapshotService.js', () => ({
  isPublishSnapshotV1Enabled: () => false,
  refreshPublishSnapshotFromCurrentPreview: vi.fn(),
}));

describe('buildLogoPreviewPatchFromUrl', () => {
  it('sets avatar, brand.logoUrl, meta, store, and top-level avatarUrl', () => {
    const patch = buildLogoPreviewPatchFromUrl('/uploads/logo.png', {
      brand: { name: 'Test' },
    });
    expect(patch.avatarUrl).toBe('/uploads/logo.png');
    expect(patch.avatarImageUrl).toBe('/uploads/logo.png');
    expect(patch.avatar?.url).toBe('/uploads/logo.png');
    expect(patch.avatar?.source).toBe('upload');
    expect(patch.brand?.logoUrl).toBe('/uploads/logo.png');
    expect(patch.meta?.profileAvatarUrl).toBe('/uploads/logo.png');
    expect(patch.meta?.userUploadedLogo).toBe(true);
    expect(patch.store?.profileAvatarUrl).toBe('/uploads/logo.png');
  });
});

describe('hasUserUploadedLogo', () => {
  it('detects checkpoint-uploaded logo markers', () => {
    expect(hasUserUploadedLogo({ meta: { userUploadedLogo: true } })).toBe(true);
    expect(
      hasUserUploadedLogo({
        avatar: { source: 'upload', imageUrl: '/uploads/logo.png' },
      }),
    ).toBe(true);
    expect(hasUserUploadedLogo({ avatar: { imageUrl: '/x.png' } })).toBe(false);
  });
});

describe('applyCheckpointLogoToDraft', () => {
  it('patches draft preview without owner access gate', async () => {
    const { patchDraftPreview } = await import('./draftStoreService.js');
    const prisma = { business: { findUnique: vi.fn(), update: vi.fn() } };
    const result = await applyCheckpointLogoToDraft({
      prisma,
      draftId: 'draft-1',
      logoUrl: '/uploads/checkpoint-logo.png',
    });
    expect(result.applied).toBe(true);
    expect(patchDraftPreview).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        avatarUrl: '/uploads/checkpoint-logo.png',
        meta: expect.objectContaining({ logoSource: 'checkpoint_upload' }),
      }),
    );
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
