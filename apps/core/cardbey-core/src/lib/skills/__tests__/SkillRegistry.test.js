import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../SkillRegistry.js';

describe('SkillRegistry', () => {
  /** @type {SkillRegistry} */
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  const sampleSkill = {
    name: 'test_skill',
    version: '1.0',
    description: 'test',
    triggers: ['launch_store', 'setup'],
    steps: [{ id: 's1', name: 'Step', tool: 'tool_a' }],
  };

  it('registers and retrieves by name', () => {
    registry.register(sampleSkill);
    expect(registry.get('test_skill')).toEqual(sampleSkill);
    expect(registry.has('test_skill')).toBe(true);
  });

  it('findByTrigger exact match', () => {
    registry.register(sampleSkill);
    expect(registry.findByTrigger('launch_store')?.name).toBe('test_skill');
  });

  it('findByTrigger prefix match', () => {
    registry.register({ ...sampleSkill, name: 'prefix_skill', triggers: ['launch'] });
    expect(registry.findByTrigger('launch_store')?.name).toBe('prefix_skill');
  });

  it('returns null for unknown trigger', () => {
    registry.register(sampleSkill);
    expect(registry.findByTrigger('unknown_intent')).toBeNull();
  });

  it('throws on duplicate registration', () => {
    registry.register(sampleSkill);
    expect(() => registry.register(sampleSkill)).toThrow(/Duplicate skill/);
  });
});
