// DANH: skill-round5-tests
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { DeployCNetSkill } from '../../lib/skills/definitions/DeployCNetSkill.js';
import { SmartDisplayPublishSkill } from '../../lib/skills/definitions/SmartDisplayPublishSkill.js';
import { execute as checkCnetConfig } from '../../lib/toolExecutors/cnet/check_cnet_config.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'deploy_cnet';
}

describe('DeployCNetSkill', () => {
  it('matches primary trigger deploy_cnet', () => {
    expect(matchesTrigger('deploy_cnet')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('analytics')).toBe(false);
  });

  it('triggers do not overlap SmartDisplayPublishSkill triggers', () => {
    const cnet = new Set(DeployCNetSkill.triggers);
    const overlap = (SmartDisplayPublishSkill.triggers ?? []).filter((t) => cnet.has(t));
    expect(overlap).toEqual([]);
  });

  it('execute returns valid tool result shape on config check', async () => {
    const result = await checkCnetConfig({ storeId: 'store-1' });
    expect(result.status).toBe('ok');
    expect(Array.isArray(result.output.missingKeys)).toBe(true);
  });

  it('step list is non-empty and ordered', () => {
    expect(DeployCNetSkill.steps.map((s) => s.tool)).toEqual([
      'check_cnet_config',
      'prepare_cnet_payload',
      'deploy_to_cnet',
    ]);
  });

  it('missing storeId handled gracefully on config executor', async () => {
    const result = await checkCnetConfig({});
    expect(result.status).toBe('ok');
    expect(result.output).toBeDefined();
  });
});
