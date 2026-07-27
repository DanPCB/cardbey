import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../skillRegistry.js';

describe('Composable SkillRegistry', () => {
  /** @type {SkillRegistry} */
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('registers skill with semantic versioning', () => {
    registry.register({ id: 'test_skill', version: '1.0.0', name: 'Test Skill' });
    const registered = registry.get('test_skill');
    expect(registered.version).toBe('1.0.0');
    expect(registered.name).toBe('Test Skill');
  });

  it('rejects invalid semver', () => {
    expect(() => registry.register({ id: 'bad', version: 'v1', name: 'Bad' })).toThrow(
      'Invalid semantic version',
    );
  });

  it('prevents downgrade', () => {
    registry.register({ id: 'test_skill', version: '1.0.0', name: 'Test Skill' });
    expect(() => {
      registry.register({ id: 'test_skill', version: '0.9.0', name: 'Test Skill' });
    }).toThrow('older than');
  });

  it('upgrades to newer version', () => {
    registry.register({ id: 'test_skill', version: '1.0.0', name: 'V1' });
    registry.register({ id: 'test_skill', version: '1.1.0', name: 'V2' });
    expect(registry.get('test_skill').version).toBe('1.1.0');
    expect(registry.get('test_skill').name).toBe('V2');
  });

  it('lists skills by category', () => {
    registry.register({ id: 'a', version: '1.0.0', category: 'analysis' });
    registry.register({ id: 'b', version: '1.0.0', category: 'marketing' });
    const skills = registry.list({ category: 'analysis' });
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('a');
  });

  it('finds skills by capability', () => {
    registry.register({
      id: 'analyze_store',
      version: '1.0.0',
      capabilities: ['analyze', 'forecast'],
    });
    const matches = registry.findByCapability('analyze');
    expect(matches.some((s) => s.id === 'analyze_store')).toBe(true);
  });

  it('returns historical version snapshot', () => {
    registry.register({ id: 'hist', version: '1.0.0', name: 'V1' });
    registry.register({ id: 'hist', version: '2.0.0', name: 'V2' });
    const v1 = registry.getVersion('hist', '1.0.0');
    expect(v1.version).toBe('1.0.0');
    expect(v1.name).toBe('V1');
    expect(v1.isHistorical).toBe(true);
  });
});
