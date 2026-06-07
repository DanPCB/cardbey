// DANH: skill-round3-health
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { StoreHealthSkill } from '../../lib/skills/definitions/StoreHealthSkill.js';
import { execute as auditCompleteness } from '../../lib/toolExecutors/audit_store_completeness.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'store_health';
}

describe('StoreHealthSkill', () => {
  it('matches primary trigger store_health', () => {
    expect(matchesTrigger('store_health')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('launch_store')).toBe(false);
  });

  it('has non-empty step list', () => {
    expect(StoreHealthSkill.steps.length).toBe(2);
    expect(StoreHealthSkill.steps.map((s) => s.tool)).toEqual([
      'audit_store_completeness',
      'generate_health_report',
    ]);
  });

  it('documents requiredContext fields', () => {
    expect(StoreHealthSkill.requiredContext).toEqual(['storeId', 'userId']);
  });

  it('health report step receives audit output', () => {
    const build = StoreHealthSkill.steps[1].buildInput;
    const input = build?.(
      { storeId: 's1' },
      { audit_completeness: { output: { score: 55, missing: ['phone'] } } },
    );
    expect(input?.audit?.score).toBe(55);
  });

  it('missing storeId fails gracefully on audit executor', async () => {
    const result = await auditCompleteness({}, {});
    expect(result.status).toBe('failed');
    expect(result.output?.error).toBe('storeId is required');
  });
});
