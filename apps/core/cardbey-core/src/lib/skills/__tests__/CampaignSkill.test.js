import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { CampaignSkill } from '../definitions/CampaignSkill.js';

describe('CampaignSkill', () => {
  it('registers under name campaign', () => {
    expect(skillRegistry.has('campaign')).toBe(true);
    expect(skillRegistry.get('campaign')?.name).toBe('campaign');
  });

  it('findByTrigger(create_campaign) returns CampaignSkill', () => {
    expect(skillRegistry.findByTrigger('create_campaign')?.name).toBe('campaign');
  });

  it('findByTrigger(run_promotion) returns CampaignSkill', () => {
    expect(skillRegistry.findByTrigger('run_promotion')?.name).toBe('campaign');
  });

  it('has all 6 steps with correct tool names', () => {
    const steps = CampaignSkill.steps;
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.tool)).toEqual([
      'create_campaign_brief',
      'search_hero_media',
      'generate_slideshow',
      'generate_campaign_copy',
      'qa_campaign_package',
      'package_campaign_artifact',
    ]);
  });

  it('generate_slideshow condition is false when find_graphics count is 0', () => {
    const step = CampaignSkill.steps.find((s) => s.id === 'generate_slideshow');
    expect(step?.condition?.({}, { find_graphics: { output: { count: 0 } } })).toBe(false);
    expect(step?.condition?.({}, { find_graphics: { output: { count: 3 } } })).toBe(true);
  });

  it('create_brief buildInput uses hydratedContext.brandKit.tone when toolInput.tone absent', () => {
    const step = CampaignSkill.steps.find((s) => s.id === 'create_brief');
    const input = step?.buildInput?.({
      storeId: 'store-1',
      toolInput: { objective: 'summer sale' },
      hydratedContext: { brandKit: { tone: 'luxury' } },
    });
    expect(input?.tone).toBe('luxury');
    expect(input?.objective).toBe('summer sale');
  });

  it('retryPolicy shouldRetry is false for VALIDATION_ERROR', () => {
    const shouldRetry = CampaignSkill.retryPolicy?.shouldRetry;
    expect(shouldRetry?.({ code: 'VALIDATION_ERROR' })).toBe(false);
    expect(shouldRetry?.({ code: 'PERMISSION_DENIED' })).toBe(false);
    expect(shouldRetry?.({ code: 'TIMEOUT' })).toBe(true);
  });
});
