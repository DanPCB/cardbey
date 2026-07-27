// DANH: fix-trigger-collision
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/index.js';

describe('skillRegistry routing — setup vs store_health collision', () => {
  it("'setup_loyalty_program' resolves to loyalty_campaign, not store_health", () => {
    const skill = skillRegistry.findByTrigger('setup_loyalty_program');
    expect(skill?.name).toBe('loyalty_campaign');
    expect(skill?.name).not.toBe('store_health');
  });

  it("'store_health' still resolves to store_health", () => {
    expect(skillRegistry.findByTrigger('store_health')?.name).toBe('store_health');
  });

  it("'setup' alone does not resolve to store_health", () => {
    const skill = skillRegistry.findByTrigger('setup');
    expect(skill?.name).not.toBe('store_health');
  });
});
