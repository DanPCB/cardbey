/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

function padMp4Buffer(sizeBytes = 110 * 1024) {
  const buf = Buffer.alloc(sizeBytes);
  buf.write('ftyp', 4);
  return buf;
}

vi.mock('../../lib/videoCompat.js', () => ({
  ensureWebCompatibleVideoBuffer: vi.fn(async (buffer) => ({
    buffer,
    mime: 'video/mp4',
    width: 1280,
    height: 720,
    durationS: 10,
    transcoded: false,
    compatible: true,
  })),
  videoUploadSkipTranscodeEnabled: vi.fn(() => false),
  videoUploadMaxTranscodeBytes: vi.fn(() => 25 * 1024 * 1024),
}));

vi.mock('../../lib/s3Client.js', () => ({
  uploadBufferToS3: vi.fn(async () => ({
    key: 'media/videos/hero.mp4',
    url: '/uploads/media/videos/hero.mp4',
  })),
}));

vi.mock('./heroUpdateService.js', () => ({
  buildHeroPreviewPatchFromUrls: vi.fn(() => ({ heroMediaType: 'video' })),
  updateHeroForStore: vi.fn(async () => ({
    storeId: 'store-1',
    draftId: 'draft-1',
    draftUpdated: true,
    businessUpdated: false,
    heroVideoUrl: '/uploads/media/videos/hero.mp4',
    heroImageUrl: null,
    heroMediaType: 'video',
  })),
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    media: { create: vi.fn(async () => ({})) },
  })),
  prisma: {},
}));

import { ensureWebCompatibleVideoBuffer, videoUploadSkipTranscodeEnabled } from '../../lib/videoCompat.js';
import { executeStoreHeroMediaUpload } from './heroMediaUploadService.js';

describe('executeStoreHeroMediaUpload video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates, compat-processes, uploads, and persists video hero', async () => {
    const buffer = padMp4Buffer();
    const result = await executeStoreHeroMediaUpload({
      userId: 'user-1',
      storeId: 'store-1',
      draft: { id: 'draft-1', preview: {}, committedStoreId: 'store-1' },
      file: {
        buffer,
        mimetype: 'video/mp4',
        originalname: 'hero.mp4',
      },
    });

    expect(ensureWebCompatibleVideoBuffer).toHaveBeenCalledWith(
      buffer,
      'hero.mp4',
      expect.objectContaining({ context: 'stores.upload.hero' }),
    );
    expect(result.ok).toBe(true);
    expect(result.isVideo).toBe(true);
    expect(result.heroVideoUrl).toBeTruthy();
    expect(result.draftUpdated).toBe(true);
  });

  it('rejects tiny invalid video buffers', async () => {
    const tiny = Buffer.alloc(3000);
    tiny.write('ftyp', 4);

    await expect(
      executeStoreHeroMediaUpload({
        userId: 'user-1',
        storeId: 'store-1',
        draft: { id: 'draft-1', preview: {}, committedStoreId: 'store-1' },
        file: {
          buffer: tiny,
          mimetype: 'video/mp4',
          originalname: 'tiny.mp4',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'invalid_video_file' });

    expect(ensureWebCompatibleVideoBuffer).not.toHaveBeenCalled();
  });

  it('skips ffmpeg compat when VIDEO_UPLOAD_SKIP_TRANSCODE is enabled', async () => {
    vi.mocked(videoUploadSkipTranscodeEnabled).mockReturnValue(true);
    const buffer = padMp4Buffer();

    const result = await executeStoreHeroMediaUpload({
      userId: 'user-1',
      storeId: 'store-1',
      draft: { id: 'draft-1', preview: {}, committedStoreId: 'store-1' },
      file: {
        buffer,
        mimetype: 'video/mp4',
        originalname: 'hero.mp4',
      },
    });

    expect(ensureWebCompatibleVideoBuffer).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.isVideo).toBe(true);
  });
});
