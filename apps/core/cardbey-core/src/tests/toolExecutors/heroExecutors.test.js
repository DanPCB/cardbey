// DANH: skill-round4-hero
import { describe, it, expect } from 'vitest';
import {
  auditHeroFromBusinessRow,
  execute as auditHeroMedia,
} from '../../lib/toolExecutors/hero/audit_hero_media.js';
import {
  buildHeroSuggestions,
  execute as suggestHeroMedia,
} from '../../lib/toolExecutors/hero/suggest_hero_media.js';

describe('hero executors', () => {
  it('audit flags missing hero as needsImprovement', () => {
    const audit = auditHeroFromBusinessRow({ type: 'cafe', brandStyle: 'modern' });
    expect(audit.needsImprovement).toBe(true);
    expect(audit.hasHeroVideo).toBe(false);
  });

  it('audit returns ok when hero image present', () => {
    const audit = auditHeroFromBusinessRow({
      heroImageUrl: 'https://cdn/hero.jpg',
      type: 'retail',
      brandStyle: 'minimal',
    });
    expect(audit.hasHeroImage).toBe(true);
    expect(audit.needsImprovement).toBe(false);
  });

  it('audit_hero_media does not throw on empty storeId', async () => {
    await expect(auditHeroMedia({})).resolves.toMatchObject({ status: 'failed' });
  });

  it('suggest_hero_media returns three suggestions', async () => {
    const built = buildHeroSuggestions({
      category: 'cafe',
      brandStyle: 'warm',
      storeName: 'Sunrise',
      needsImprovement: true,
    });
    expect(built.suggestions).toHaveLength(3);
    const result = await suggestHeroMedia({
      category: 'cafe',
      brandStyle: 'warm',
      storeName: 'Sunrise',
      needsImprovement: true,
    });
    expect(result.status).toBe('ok');
    expect(result.output.recommendedAction).toBe('search_photo');
  });
});
