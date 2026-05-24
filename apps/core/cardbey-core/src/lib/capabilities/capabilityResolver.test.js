import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveCapabilityExecutionPlan, intakeSuccessFromCapabilityPlan } from './capabilityResolver.js';
import * as capabilityRegistry from './capabilityRegistry.js';

describe('capabilityResolver', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.VIDEO_GENERATION_PROVIDER;
    delete process.env.VIDEO_ARTIFACT_MOCK_URL;
    delete process.env.SLIDESHOW_GENERATION_PROVIDER;
    delete process.env.SLIDESHOW_ARTIFACT_MOCK_URL;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('1. promo_video without video provider offers slideshow fallback when slideshow mock available', () => {
    process.env.SLIDESHOW_GENERATION_PROVIDER = 'mock';
    process.env.SLIDESHOW_ARTIFACT_MOCK_URL = 'https://example.com/s.gif';

    const plan = resolveCapabilityExecutionPlan({
      capability: 'promo_video',
      requestedTool: 'video_generate_multimodal',
      userMessage: 'Create a promotion video for PTH Furniture store',
      context: { activeStoreId: 'store-1', activeStoreName: 'PTH Furniture' },
    });

    expect(plan.selectedStrategy).toBe('fallback_offer');
    expect(plan.selectedTool).toBe('generate_slideshow');
    expect(plan.fallbackOptions.some((o) => o.tool === 'generate_slideshow' && o.available)).toBe(true);
    expect(intakeSuccessFromCapabilityPlan(plan)).toBe(false);
    expect(plan.userMessage.toLowerCase()).toContain('not connected');
  });

  it('2. promo_video without video provider offers poster fallback when slideshow unavailable', () => {
    const plan = resolveCapabilityExecutionPlan({
      capability: 'promo_video',
      requestedTool: 'video_generate_multimodal',
      context: { activeStoreId: 'store-1' },
    });

    expect(plan.selectedStrategy).toBe('fallback_offer');
    expect(plan.fallbackOptions.some((o) => o.tool === 'generate_poster' && o.available)).toBe(true);
    expect(plan.fallbackOptions.find((o) => o.tool === 'generate_slideshow')?.available).toBe(false);
    expect(intakeSuccessFromCapabilityPlan(plan)).toBe(false);
  });

  it('2b. promo_video with no executable fallback → unavailable', () => {
    vi.spyOn(capabilityRegistry, 'isToolProviderAvailable').mockReturnValue({
      available: false,
      reason: 'Not connected',
    });

    const plan = resolveCapabilityExecutionPlan({
      capability: 'promo_video',
      requestedTool: 'video_generate_multimodal',
      context: { activeStoreId: 'store-1' },
    });

    expect(plan.selectedStrategy).toBe('unavailable');
    expect(plan.selectedTool).toBeNull();
    expect(intakeSuccessFromCapabilityPlan(plan)).toBe(false);
    expect(plan.userMessage).toMatch(/No alternative/i);

    vi.restoreAllMocks();
  });

  it('3. promo_video with video mock provider → primary selected', () => {
    process.env.VIDEO_GENERATION_PROVIDER = 'mock';
    process.env.VIDEO_ARTIFACT_MOCK_URL = 'https://example.com/v.mp4';

    const plan = resolveCapabilityExecutionPlan({
      capability: 'promo_video',
      requestedTool: 'video_generate_multimodal',
      context: { activeStoreId: 'store-1' },
    });

    expect(plan.selectedStrategy).toBe('primary');
    expect(plan.selectedTool).toBe('video_generate_multimodal');
    expect(intakeSuccessFromCapabilityPlan(plan)).toBe(true);
  });

  it('4. fallback_offer never marks intake success completed', () => {
    process.env.SLIDESHOW_GENERATION_PROVIDER = 'mock';
    process.env.SLIDESHOW_ARTIFACT_MOCK_URL = 'https://example.com/s.gif';

    const plan = resolveCapabilityExecutionPlan({
      capability: 'promo_video',
      requestedTool: 'video_generate_multimodal',
      context: { activeStoreId: 's1' },
    });

    expect(plan.selectedStrategy).toBe('fallback_offer');
    expect(intakeSuccessFromCapabilityPlan(plan)).toBe(false);
  });

  it('5. missing storeId returns missing_context', () => {
    const plan = resolveCapabilityExecutionPlan({
      capability: 'promo_video',
      requestedTool: 'video_generate_multimodal',
      userMessage: 'Create a promotion video for PTH Furniture store',
      context: {},
    });

    expect(plan.selectedStrategy).toBe('missing_context');
    expect(plan.missingContext).toContain('storeId');
    expect(plan.userMessage.toLowerCase()).toContain('which store');
  });
});
