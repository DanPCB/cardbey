import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { LocalGrowthSkill } from '../definitions/LocalGrowthSkill.js';

describe('LocalGrowthSkill', () => {
  it("registers under 'local_growth'", () => {
    expect(skillRegistry.has('local_growth')).toBe(true);
    expect(skillRegistry.get('local_growth')?.name).toBe('local_growth');
  });

  it('findByTrigger(grow_my_business) returns LocalGrowthSkill', () => {
    expect(skillRegistry.findByTrigger('grow_my_business')?.name).toBe('local_growth');
  });

  it('findByTrigger(get_more_customers) returns LocalGrowthSkill', () => {
    expect(skillRegistry.findByTrigger('get_more_customers')?.name).toBe('local_growth');
  });

  it('has 4 steps with correct structure', () => {
    const steps = LocalGrowthSkill.steps;
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.id)).toEqual(['audit', 'plan', 'execute', 'monitor']);
    expect(steps[0]?.tool).toBe('audit_local_presence');
    expect(steps[1]?.tool).toBe('generate_growth_plan');
    expect(steps[2]?.tool).toBeNull();
    expect(steps[3]?.tool).toBe('monitor_growth_baseline');
  });

  it('execute step: tool is null, condition false when autoExecute false', () => {
    const step = LocalGrowthSkill.steps.find((s) => s.id === 'execute');
    expect(step?.tool).toBeNull();
    expect(
      step?.condition?.(
        {},
        { plan: { output: { plan: { topAction: { autoExecute: false } } } } },
      ),
    ).toBe(false);
    expect(
      step?.condition?.(
        {},
        { plan: { output: { plan: { topAction: { autoExecute: true } } } } },
      ),
    ).toBe(true);
  });

  it('monitor step is required false', () => {
    const step = LocalGrowthSkill.steps.find((s) => s.id === 'monitor');
    expect(step?.required).toBe(false);
  });

  it('composes includes all 4 skills', () => {
    expect(LocalGrowthSkill.composes).toEqual([
      'campaign',
      'offer_optimization',
      'store_launch',
      'smart_display_publish',
    ]);
  });
});
