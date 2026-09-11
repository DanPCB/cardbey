import { describe, expect, it } from 'vitest';
import {
  sanitizeDraftPreviewBusinessName,
  stripMissionTitleBusinessPrefix,
} from './sanitizeDraftBusinessName.js';

describe('sanitizeDraftBusinessName', () => {
  it('strips Create store prefix', () => {
    expect(stripMissionTitleBusinessPrefix('Create store: Pho Saigon')).toBe('Pho Saigon');
  });

  it('cleans preview storeName slogan tagline', () => {
    const cleaned = sanitizeDraftPreviewBusinessName({
      storeName: 'Create store: Pho Saigon',
      slogan: 'Create store: Pho Saigon',
      tagline: 'Create store: Pho Saigon',
      heroText: 'Welcome',
      meta: { storeName: 'Create store: Pho Saigon' },
    });
    expect(cleaned.storeName).toBe('Pho Saigon');
    expect(cleaned.slogan).toBe('Pho Saigon');
    expect(cleaned.tagline).toBe('Pho Saigon');
    expect(cleaned.meta.storeName).toBe('Pho Saigon');
    expect(cleaned.heroText).toBe('Welcome');
  });
});
