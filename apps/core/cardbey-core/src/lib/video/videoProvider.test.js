import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveVideoProvider,
  isVideoGenerationProviderAvailable,
  videoProviderUnavailableReason,
} from './videoProvider.js';

describe('videoProvider', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.VIDEO_GENERATION_PROVIDER;
    delete process.env.VIDEO_ARTIFACT_MOCK_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.KLING_ACCESS_KEY;
    delete process.env.KLING_SECRET_KEY;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('auto-detects kling when access keys are present', () => {
    process.env.KLING_ACCESS_KEY = 'ak-test';
    process.env.KLING_SECRET_KEY = 'sk-test';
    expect(resolveVideoProvider()).toBe('kling');
    expect(isVideoGenerationProviderAvailable()).toBe(true);
  });

  it('prefers explicit VIDEO_GENERATION_PROVIDER over auto-detect', () => {
    process.env.VIDEO_GENERATION_PROVIDER = 'mock';
    process.env.VIDEO_ARTIFACT_MOCK_URL = 'https://example.com/v.mp4';
    process.env.KLING_ACCESS_KEY = 'ak-test';
    process.env.KLING_SECRET_KEY = 'sk-test';
    expect(resolveVideoProvider()).toBe('mock');
  });

  it('returns null when nothing configured', () => {
    expect(resolveVideoProvider()).toBeNull();
    expect(isVideoGenerationProviderAvailable()).toBe(false);
    expect(videoProviderUnavailableReason()).toMatch(/KLING_ACCESS_KEY/);
  });
});
