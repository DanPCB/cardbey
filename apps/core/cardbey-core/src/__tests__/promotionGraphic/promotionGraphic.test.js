// Promotion graphic pipeline tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generatePromoLayout,
  composeGraphicElements,
} from '../../services/promotionGraphic/promotionGraphicService.js';
import { execute as smartVisualExecute } from '../../lib/toolExecutors/design/smart_visual.js';

vi.mock('../../services/promotionGraphic/promotionGraphicService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPromotionGraphic: vi.fn(),
  };
});

import { createPromotionGraphic } from '../../services/promotionGraphic/promotionGraphicService.js';

describe('promotionGraphicService', () => {
  it('generatePromoLayout returns hero layout by default', () => {
    const layout = generatePromoLayout({
      intent: 'spring collection dresses',
      content: { headline: 'Spring Collection', subheadline: 'New arrivals' },
      format: '16:9',
      mood: 'elegant',
    });
    expect(layout.layout).toBe('hero');
    expect(layout.background.type).toBe('photo');
    expect(layout.text.title.align).toBe('center');
    expect(layout.visuals.overlayStrength).toBeGreaterThan(0);
  });

  it('generatePromoLayout picks minimal when intent says minimal', () => {
    const layout = generatePromoLayout({
      intent: 'minimal clean promo for cafe',
      content: {},
      format: '9:16',
    });
    expect(layout.layout).toBe('minimal');
  });

  it('composeGraphicElements builds headline, subheadline, and CTA layers', () => {
    const { elements, width, height } = composeGraphicElements({
      imageUrl: '/assets/test-bg.png',
      copy: {
        headline: 'Spring Collection',
        subheadline: 'New dresses in store',
        ctaText: 'Shop Now',
      },
      brand: { primaryColor: '#E11D48', logoUrl: null },
      format: '16:9',
    });
    expect(width).toBe(1920);
    expect(height).toBe(1080);
    expect(elements.some((el) => el.id === 'headline' && el.content === 'Spring Collection')).toBe(true);
    expect(elements.some((el) => el.id === 'cta' && el.content === 'Shop Now')).toBe(true);
    expect(elements.some((el) => el.id === 'bg-image')).toBe(true);
  });
});

describe('smart_visual executor', () => {
  beforeEach(() => {
    vi.mocked(createPromotionGraphic).mockReset();
  });

  it('requires description', async () => {
    const result = await smartVisualExecute({}, { storeId: 'store-1', userId: 'user-1' });
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('DESCRIPTION_REQUIRED');
  });

  it('requires storeId', async () => {
    const result = await smartVisualExecute({ prompt: 'spring promo' }, { userId: 'user-1' });
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('STORE_ID_REQUIRED');
  });

  it('returns checkpoint payload when image resolution fails', async () => {
    vi.mocked(createPromotionGraphic).mockResolvedValue({
      ok: false,
      phase: 'awaiting_promo_image',
      checkpoint: 'upload_image',
      message: 'No image',
      description: 'spring promo',
      storeId: 'store-1',
    });
    const result = await smartVisualExecute(
      { prompt: 'spring collection dresses' },
      { storeId: 'store-1', userId: 'user-1' },
    );
    expect(result.status).toBe('ok');
    expect(result.output?.phase).toBe('awaiting_promo_image');
  });

  it('returns graphic payload on success', async () => {
    vi.mocked(createPromotionGraphic).mockResolvedValue({
      promotionId: 'promo-1',
      instanceId: 'content-1',
      graphicUrl: '/assets/promo-graphics/test.png',
      copy: { headline: 'Spring', subheadline: 'New', ctaText: 'Shop' },
      layout: {},
      elements: [],
      width: 1920,
      height: 1080,
      actions: [],
      message: 'ok',
      imageSource: 'stock',
    });

    const result = await smartVisualExecute(
      { prompt: 'spring collection dresses' },
      { storeId: 'store-1', userId: 'user-1' },
    );

    expect(result.status).toBe('ok');
    expect(result.output?.instanceId).toBe('content-1');
    expect(result.output?.promotionId).toBe('promo-1');
    expect(result.output?.graphicUrl).toContain('/assets/');
  });
});
