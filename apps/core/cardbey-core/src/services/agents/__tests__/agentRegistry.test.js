import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from '../agentRegistry.js';

describe('AgentRegistry', () => {
  /** @type {AgentRegistry} */
  let registry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('registers and discovers agents', () => {
    registry.register({
      id: 'test_agent',
      name: 'Test Agent',
      capabilities: ['test'],
    });

    const found = registry.get('test_agent');
    expect(found).toBeDefined();
    expect(found.name).toBe('Test Agent');

    const byCap = registry.findByCapability('test');
    expect(byCap).toHaveLength(1);
    expect(byCap[0].id).toBe('test_agent');
  });

  it('requires id, name, and capabilities', () => {
    expect(() => registry.register({ name: 'Missing ID', capabilities: ['x'] })).toThrow(
      'Agent ID is required',
    );
    expect(() => registry.register({ id: 'a', capabilities: ['x'] })).toThrow(
      'Agent name is required',
    );
    expect(() => registry.register({ id: 'a', name: 'A', capabilities: [] })).toThrow(
      'Agent must have at least one capability',
    );
  });

  it('finds best agent by health', () => {
    registry.register({
      id: 'test_agent2',
      name: 'Test Agent 2',
      capabilities: ['test'],
    });
    registry.setStatus('test_agent2', 'active');
    registry.updateHealth('test_agent2', { status: 'healthy' });

    const best = registry.findBestAgent('test');
    expect(best?.id).toBe('test_agent2');
  });

  it('manages lifecycle status', () => {
    registry.register({
      id: 'lifecycle_agent',
      name: 'Lifecycle Agent',
      capabilities: ['test'],
    });

    registry.setStatus('lifecycle_agent', 'active');
    expect(registry.get('lifecycle_agent').status).toBe('active');

    registry.setStatus('lifecycle_agent', 'paused');
    expect(registry.isHealthy('lifecycle_agent')).toBe(false);
  });

  it('unregisters agents and capability index', () => {
    registry.register({
      id: 'temp_agent',
      name: 'Temp',
      capabilities: ['temp'],
    });

    expect(registry.unregister('temp_agent')).toBe(true);
    expect(registry.get('temp_agent')).toBeNull();
    expect(registry.findByCapability('temp')).toHaveLength(0);
  });
});
