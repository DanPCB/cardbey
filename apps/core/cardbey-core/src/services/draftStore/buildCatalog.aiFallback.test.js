import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('buildCatalog AI fallback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to template catalog when AI generation throws', async () => {
    vi.doMock('./buildCatalog.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        buildFromAi: vi.fn(async () => {
          throw new Error('AI service is not available. Please configure OPENAI_API_KEY.');
        }),
      };
    });

    const { buildCatalog } = await import('./buildCatalog.js');

    const result = await buildCatalog({
      mode: 'ai',
      draftId: 'draft_test_1',
      businessName: 'CA HANDYMAN',
      businessType: 'Home & garden',
      storeType: 'Home & garden',
      location: 'Melbourne',
      verticalSlug: 'retail.home_garden',
      includeImages: false,
    });

    expect(result?.products?.length).toBeGreaterThan(0);
    expect(result?.meta?.aiFallback).toBe(true);
    expect(result?.meta?.catalogSource).toBe('template');
    const names = (result?.products ?? []).map((p) => p.name);
    expect(names.some((n) => /interior painting|tv wall mounting|door repair|window cleaning/i.test(String(n)))).toBe(
      true,
    );
    expect(names.some((n) => /featured item|variant b|size s/i.test(String(n)))).toBe(false);
  });
});
