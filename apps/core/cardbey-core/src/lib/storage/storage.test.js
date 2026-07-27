import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  makeObjectKey,
  resolveStorageDriver,
  getStorageConfig,
  validateS3StorageConfig,
  resetStorageAdapterForTests,
  getStorageAdapter,
} from './index.js';
import { isCloudFrontUrl, normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';

describe('storage module', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    resetStorageAdapterForTests();
  });

  describe('makeObjectKey', () => {
    it('builds categorized UUID keys', () => {
      const key = makeObjectKey('logos', 'brand.png', 'image/png');
      expect(key).toMatch(/^media\/logos\/[0-9a-f-]{36}\.png$/);
    });

    it('falls back to artifacts for unknown category', () => {
      const key = makeObjectKey('unknown', 'file.bin', 'application/octet-stream');
      expect(key).toMatch(/^media\/artifacts\/[0-9a-f-]{36}\.bin$/);
    });
  });

  describe('resolveStorageDriver', () => {
    it('defaults to local', () => {
      delete process.env.STORAGE_DRIVER;
      expect(resolveStorageDriver()).toBe('local');
    });

    it('honors STORAGE_DRIVER=s3', () => {
      process.env.STORAGE_DRIVER = 's3';
      expect(resolveStorageDriver()).toBe('s3');
    });
  });

  describe('validateS3StorageConfig', () => {
    it('reports missing vars when driver is s3', () => {
      process.env.STORAGE_DRIVER = 's3';
      delete process.env.S3_BUCKET;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.S3_SECRET_ACCESS_KEY;
      delete process.env.MEDIA_PUBLIC_BASE_URL;
      delete process.env.S3_ENDPOINT;

      const result = validateS3StorageConfig();
      expect(result.ok).toBe(false);
      expect(result.missing).toContain('S3_BUCKET');
      expect(result.missing).toContain('MEDIA_PUBLIC_BASE_URL');
    });
  });

  describe('local storage adapter', () => {
    let tmpRoot;

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-storage-'));
      delete process.env.STORAGE_DRIVER;
      resetStorageAdapterForTests();
    });

    afterEach(() => {
      if (tmpRoot && fs.existsSync(tmpRoot)) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('writes under /uploads and returns relative URL', async () => {
      const { createLocalStorageAdapter } = await import('./localStorageAdapter.js');
      const adapter = createLocalStorageAdapter(tmpRoot);
      const { key, url } = await adapter.uploadBuffer(
        'logos',
        Buffer.from('png-bytes'),
        'logo.png',
        'image/png',
      );
      expect(url).toBe(`/uploads/${key}`);
      expect(fs.existsSync(path.join(tmpRoot, key))).toBe(true);
    });
  });
});

describe('publicUrl remote media detection', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('recognizes MEDIA_PUBLIC_BASE_URL host as persisted remote media', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.cardbey.com';
    const url = 'https://media.cardbey.com/media/logos/abc.png';
    expect(isCloudFrontUrl(url)).toBe(true);
    expect(normalizeMediaUrlForStorage(url, null)).toBe(url);
  });

  it('stores legacy /uploads paths as relative in local mode', () => {
    delete process.env.MEDIA_PUBLIC_BASE_URL;
    const url = 'http://localhost:3001/uploads/media/hero.mp4';
    expect(normalizeMediaUrlForStorage(url, null)).toBe('/uploads/media/hero.mp4');
  });
});
