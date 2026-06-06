import { describe, it, expect } from 'vitest';
import { detectFixableStoreBuildIssues } from './storeBuildQaAutoFix.js';

describe('storeBuildQaAutoFix logo preservation', () => {
  it('does not flag avatar issue when user uploaded logo is present', () => {
    const preview = {
      tagline: 'Fresh baked goods daily for everyone',
      description: 'A neighborhood bakery serving artisan breads and pastries every morning.',
      heroImageUrl: 'https://cdn.example/hero.jpg',
      avatar: { source: 'upload', imageUrl: 'https://cdn.example/logo.png' },
      avatarImageUrl: 'https://cdn.example/logo.png',
      brand: { logoUrl: 'https://cdn.example/logo.png' },
      meta: { userUploadedLogo: true, logoSource: 'checkpoint_upload', verticalSlug: 'food.bakery' },
      items: [{ name: 'Bread', imageUrl: 'https://cdn.example/bread.jpg', description: 'Fresh sourdough loaf baked daily' }],
    };
    const issues = detectFixableStoreBuildIssues(preview, {}, { businessVertical: 'food.bakery' });
    expect(issues.has('avatar')).toBe(false);
  });

  it('still flags avatar when no logo was uploaded', () => {
    const preview = {
      tagline: 'Fresh baked goods daily for everyone',
      description: 'A neighborhood bakery serving artisan breads and pastries every morning.',
      heroImageUrl: 'https://cdn.example/hero.jpg',
      items: [{ name: 'Bread', imageUrl: 'https://cdn.example/bread.jpg', description: 'Fresh sourdough loaf baked daily' }],
      meta: { verticalSlug: 'food.bakery' },
    };
    const issues = detectFixableStoreBuildIssues(preview, {}, { businessVertical: 'food.bakery' });
    expect(issues.has('avatar')).toBe(true);
  });
});
