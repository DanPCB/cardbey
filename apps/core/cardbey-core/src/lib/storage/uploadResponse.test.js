import { describe, it, expect, afterEach } from 'vitest';
import { buildStorageUploadResponse, resolveClientHeroMediaUrl } from './uploadResponse.js';

describe('buildStorageUploadResponse', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns MEDIA_PUBLIC_BASE_URL URL for s3 driver', () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'cardbey-media';
    process.env.S3_ACCESS_KEY_ID = 'key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret';
    process.env.S3_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.cardbey.com';

    const result = buildStorageUploadResponse({
      storageUrl: 'https://media.cardbey.com/media/videos/abc.mp4',
      key: 'media/videos/abc.mp4',
      mime: 'video/mp4',
      mediaType: 'video',
    });

    expect(result.storageDriver).toBe('s3');
    expect(result.url).toBe('https://media.cardbey.com/media/videos/abc.mp4');
    expect(result.publicUrl).toBe('https://media.cardbey.com/media/videos/abc.mp4');
    expect(result.url).not.toContain('/uploads/');
    expect(result.key).toBe('media/videos/abc.mp4');
    expect(result.mediaType).toBe('video');
  });

  it('returns absolute Core URL for local driver relative path', () => {
    delete process.env.STORAGE_DRIVER;
    process.env.PUBLIC_BASE_URL = 'https://cardbey-core.onrender.com';

    const result = buildStorageUploadResponse({
      storageUrl: '/uploads/media/videos/local.mp4',
      key: 'media/videos/local.mp4',
      mime: 'video/mp4',
      mediaType: 'video',
    });

    expect(result.storageDriver).toBe('local');
    expect(result.url).toBe('https://cardbey-core.onrender.com/uploads/media/videos/local.mp4');
    expect(result.normalizedUrl).toBe('/uploads/media/videos/local.mp4');
  });
});

describe('resolveClientHeroMediaUrl', () => {
  afterEach(() => {
    delete process.env.MEDIA_PUBLIC_BASE_URL;
  });

  it('prefers stored CDN URL over upload fallback', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.cardbey.com';
    const url = resolveClientHeroMediaUrl(
      'https://media.cardbey.com/media/videos/stored.mp4',
      'https://media.cardbey.com/media/videos/fallback.mp4',
    );
    expect(url).toBe('https://media.cardbey.com/media/videos/stored.mp4');
  });
});
