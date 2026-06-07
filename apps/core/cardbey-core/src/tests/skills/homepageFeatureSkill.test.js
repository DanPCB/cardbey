// DANH: skill-round4-feature
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { HomepageFeatureSkill } from '../../lib/skills/definitions/HomepageFeatureSkill.js';
import { CampaignSkill } from '../../lib/skills/definitions/CampaignSkill.js';
import { execute as identifyFeatureTarget } from '../../lib/toolExecutors/homepage/identify_feature_target.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'homepage_feature';
}

describe('HomepageFeatureSkill', () => {
  it('matches primary trigger feature_on_homepage', () => {
    expect(matchesTrigger('feature_on_homepage')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('menu_sync')).toBe(false);
  });

  it('triggers do not overlap CampaignSkill triggers', () => {
    const feature = new Set(HomepageFeatureSkill.triggers);
    const overlap = (CampaignSkill.triggers ?? []).filter((t) => feature.has(t));
    expect(overlap).toEqual([]);
  });

  it('step list is non-empty and ordered', () => {
    expect(HomepageFeatureSkill.steps.map((s) => s.tool)).toEqual([
      'identify_feature_target',
      'apply_homepage_feature',
    ]);
  });

  it('execute returns valid tool result shape on identify step', async () => {
    const result = await identifyFeatureTarget({ storeId: 'store-1', userMessage: 'feature latte' });
    expect(['ok', 'failed']).toContain(result.status);
    expect(result.output).toBeDefined();
  });

  it('missing storeId handled gracefully on identify executor', async () => {
    const result = await identifyFeatureTarget({});
    expect(result.status).toBe('failed');
    expect(result.output?.error).toBe('storeId is required');
  });
});
