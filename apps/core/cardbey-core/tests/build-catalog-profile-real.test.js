/**
 * When businessProfileService is available, buildFromAi uses it (not fallback).
 * Guards against regressing to always-fallback.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGenerateBusinessProfile = vi.fn().mockResolvedValue({
  name: 'Real AI Florist',
  type: 'florist',
  tagline: 'Fresh flowers daily',
  heroText: 'Welcome to Real AI Florist',
  primaryColor: '#2d5016',
  secondaryColor: '#ffb347',
  stylePreferences: { style: 'modern', mood: 'warm' },
});

vi.mock('../src/services/businessProfileService.ts', () => ({
  generateBusinessProfile: mockGenerateBusinessProfile,
  default: { generateBusinessProfile: mockGenerateBusinessProfile },
}));

const mockMenuResult = {
  categories: [{ id: 'cat_0', name: 'Flowers' }],
  items: Array.from({ length: 24 }, (_, i) => ({
    id: `item_${i}`,
    name: `Bouquet ${i + 1}`,
    description: 'Fresh flowers',
    categoryId: 'cat_0',
    imageUrl: null,
  })),
};
vi.mock('../src/services/draftStore/menuGenerationService.js', () => ({
  generateVerticalLockedMenu: vi.fn().mockResolvedValue(mockMenuResult),
}));

const { buildFromAi } = await import('../src/services/draftStore/buildCatalog.js');

describe('buildFromAi uses real profile when available', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateBusinessProfile and uses real profile (not fallback)', async () => {
    const result = await buildFromAi({
      draftId: 'test-real',
      businessName: 'Test Florist',
      businessType: 'Florist',
      prompt: 'A flower shop in Melbourne',
    });

    expect(mockGenerateBusinessProfile).toHaveBeenCalledTimes(1);
    expect(mockGenerateBusinessProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'ai_description',
        descriptionText: 'A flower shop in Melbourne',
        explicitName: 'Test Florist',
        explicitType: 'Florist',
      }),
    );

    expect(result.profile.name).toBe('Real AI Florist');
    expect(result.profile.type).toBe('florist');
    expect(result.meta.business_profile_source).toBe('ai');
    expect(result.products.length).toBeGreaterThan(0);
  });
});
