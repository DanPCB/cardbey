// DANH: skill-round4-hero
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { HeroOptimizationSkill } from '../../lib/skills/definitions/HeroOptimizationSkill.js';
import { CampaignSkill } from '../../lib/skills/definitions/CampaignSkill.js';
import { execute as auditHeroMedia } from '../../lib/toolExecutors/hero/audit_hero_media.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'hero_optimization';
}

describe('HeroOptimizationSkill', () => {
  it('matches primary trigger improve_hero', () => {
    expect(matchesTrigger('improve_hero')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('generate_tags')).toBe(false);
  });

  it('triggers do not overlap CampaignSkill triggers', () => {
    const hero = new Set(HeroOptimizationSkill.triggers);
    const overlap = (CampaignSkill.triggers ?? []).filter((t) => hero.has(t));
    expect(overlap).toEqual([]);
  });

  it('step list is non-empty and ordered', () => {
    expect(HeroOptimizationSkill.steps.map((s) => s.tool)).toEqual([
      'audit_hero_media',
      'suggest_hero_media',
    ]);
  });

  it('execute returns valid tool result shape on audit step', async () => {
    const result = await auditHeroMedia({ storeId: 'store-x' });
    expect(['ok', 'failed']).toContain(result.status);
    expect(result.output).toBeDefined();
  });

  it('missing storeId handled gracefully on audit executor', async () => {
    const result = await auditHeroMedia({});
    expect(result.status).toBe('failed');
    expect(result.output?.error).toBe('storeId is required');
  });
});
