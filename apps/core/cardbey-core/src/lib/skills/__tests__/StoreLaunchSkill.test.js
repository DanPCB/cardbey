import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { StoreLaunchSkill } from '../definitions/StoreLaunchSkill.js';

describe('StoreLaunchSkill', () => {
  it('is registered in skillRegistry after import', () => {
    expect(skillRegistry.has('store_launch')).toBe(true);
    expect(skillRegistry.get('store_launch')?.name).toBe('store_launch');
  });

  it('has all 4 steps with correct tool names', () => {
    const steps = StoreLaunchSkill.steps;
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.tool)).toEqual([
      'update_brand_kit',
      'search_hero_media',
      'setBusinessSocialLinks',
      'structured_store_build',
    ]);
  });

  it('check_brandkit condition is false when no brandkit input', () => {
    const step = StoreLaunchSkill.steps.find((s) => s.id === 'check_brandkit');
    expect(step?.condition?.({ toolInput: {} }, {})).toBe(false);
    expect(
      step?.condition?.({ toolInput: { tone: 'friendly', colors: ['#fff'] } }, {}),
    ).toBe(true);
  });

  it('set_social_links condition is false when no socialLinks', () => {
    const step = StoreLaunchSkill.steps.find((s) => s.id === 'set_social_links');
    expect(step?.condition?.({ toolInput: {} }, {})).toBe(false);
    expect(step?.condition?.({ toolInput: { socialLinks: { instagram: 'x' } } }, {})).toBe(true);
  });

  it('retryPolicy shouldRetry is false for VALIDATION_ERROR', () => {
    const shouldRetry = StoreLaunchSkill.retryPolicy?.shouldRetry;
    expect(shouldRetry?.({ code: 'VALIDATION_ERROR' })).toBe(false);
    expect(shouldRetry?.({ code: 'PERMISSION_DENIED' })).toBe(false);
    expect(shouldRetry?.({ code: 'TIMEOUT' })).toBe(true);
  });

  it('findByTrigger recognizes launch_store', () => {
    expect(skillRegistry.findByTrigger('launch_store')?.name).toBe('store_launch');
  });
});
