import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, resetToolRegistryForTests } from '../ToolRegistry.js';
import type { Tool } from '../toolTypes.js';

describe('ToolRegistry', () => {
  beforeEach(() => {
    resetToolRegistryForTests();
  });

  it('registers and executes tools', async () => {
    const registry = new ToolRegistry();
    const tool: Tool = {
      name: 'echo',
      description: 'Echo params',
      parameters: [{ name: 'text', type: 'string', description: 'Text', required: true }],
      execute: async (params) => ({ ok: true, data: params }),
    };
    registry.register(tool);

    const result = await registry.execute('echo', { text: 'hello' });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ text: 'hello' });
  });

  it('returns error for unknown tools', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute('missing', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('exports LLM-compatible definitions', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'get_store_metrics',
      description: 'Store KPIs',
      parameters: [{ name: 'storeId', type: 'string', description: 'Store', required: true }],
      execute: async () => ({ ok: true }),
    });

    const defs = registry.toLlmToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('get_store_metrics');
    expect(defs[0].parameters).toMatchObject({
      type: 'object',
      required: ['storeId'],
    });
  });
});
