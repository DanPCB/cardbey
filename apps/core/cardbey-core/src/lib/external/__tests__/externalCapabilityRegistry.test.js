import { describe, expect, it } from 'vitest';
import {
  buildExternalCapabilityStatus,
  buildLegacyFeatureStatus,
  getExternalCapability,
  listExternalCapabilities,
} from '../externalCapabilityRegistry.js';

describe('externalCapabilityRegistry', () => {
  it('lists registered capabilities with ids and categories', () => {
    const list = listExternalCapabilities();
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.some((c) => c.id === 'video.generation')).toBe(true);
    expect(list.some((c) => c.id === 'vision.ocr')).toBe(true);
  });

  it('getExternalCapability returns entry by id', () => {
    const entry = getExternalCapability('content.social');
    expect(entry?.executorTools).toContain('generate_social_posts');
    expect(entry?.featureKey).toBe('social');
  });

  it('buildLegacyFeatureStatus exposes video, cnet, ocr, social keys', () => {
    const features = buildLegacyFeatureStatus({});
    expect(typeof features.video.available).toBe('boolean');
    expect(typeof features.cnet.available).toBe('boolean');
    expect(typeof features.ocr.available).toBe('boolean');
    expect(features.social.available).toBe(true);
    expect(typeof features.llm.available).toBe('boolean');
    expect(typeof features.media.available).toBe('boolean');
    expect(typeof features.storage.available).toBe('boolean');
    expect(typeof features.translation.available).toBe('boolean');
  });

  it('buildExternalCapabilityStatus includes executor mapping', () => {
    const status = buildExternalCapabilityStatus({});
    const ocr = status.find((s) => s.id === 'vision.ocr');
    expect(ocr?.executorTools).toContain('extract_card_data');
    expect(ocr?.category).toBe('vision');
  });

  it('ocr available when OPENAI_API_KEY is set', () => {
    const features = buildLegacyFeatureStatus({ OPENAI_API_KEY: 'sk-test' });
    expect(features.ocr.available).toBe(true);
  });
});
