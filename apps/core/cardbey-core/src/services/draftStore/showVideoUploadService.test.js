import { describe, expect, it, vi, beforeEach } from 'vitest';
import { executeShowVideoUpload } from './showVideoUploadService.js';

vi.mock('../../lib/s3Client.js', () => ({
  uploadBufferToS3: vi.fn(async () => ({ url: 'https://cdn.example.com/show.mp4', key: 'videos/show.mp4' })),
}));

describe('showVideoUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends work to storefrontSettings.featuredWorks and bumps publishedAt when active', async () => {
    const update = vi.fn(async () => ({}));
    const prisma = {
      business: {
        findUnique: vi.fn(async () => ({
          id: 'store-1',
          isActive: true,
          storefrontSettings: { featuredWorks: [{ id: 'old', title: 'Old', type: 'video' }] },
          stylePreferences: {},
        })),
        update,
      },
    };

    const file = {
      buffer: Buffer.from('fake-video'),
      mimetype: 'video/mp4',
      originalname: 'clip.mp4',
      size: 11,
    };

    const result = await executeShowVideoUpload({ prisma, storeId: 'store-1', file, title: 'Fresh clip' });

    expect(result.work.title).toBe('Fresh clip');
    expect(result.work.kind).toBe('video');
    expect(result.publishedAt).toBeTruthy();

    const data = update.mock.calls[0][0].data;
    expect(data.storefrontSettings.featuredWorks[0].title).toBe('Fresh clip');
    expect(data.storefrontSettings.featuredWorks[1].id).toBe('old');
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it('rejects upload when user does not own the store', async () => {
    const prisma = {
      business: {
        findUnique: vi.fn(async () => ({
          id: 'store-1',
          isActive: true,
          userId: 'owner-a',
          storefrontSettings: {},
          stylePreferences: {},
        })),
        update: vi.fn(),
      },
    };

    const file = {
      buffer: Buffer.from('fake-video'),
      mimetype: 'video/mp4',
      originalname: 'clip.mp4',
      size: 11,
    };

    await expect(
      executeShowVideoUpload({ prisma, storeId: 'store-1', file, userId: 'owner-b' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
