import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry, resetToolRegistryForTests } from '../ToolRegistry.js';
import { registerCoreTools, resetCoreToolsRegistrationForTests } from '../coreTools.js';

vi.mock('../../lib/toolDispatcher.js', () => ({
  dispatchTool: vi.fn(async (toolName: string) => ({
    status: 'ok',
    output: { toolName, sample: true },
  })),
}));

describe('core tools integration', () => {
  beforeEach(() => {
    resetToolRegistryForTests();
    resetCoreToolsRegistrationForTests();
    vi.clearAllMocks();
  });

  it('registers all core tools', () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const names = registry.list().map((t) => t.name);
    expect(names).toContain('fetch_campaign_analytics');
    expect(names).toContain('get_store_metrics');
    expect(names).toContain('create_campaign');
    expect(names).toContain('update_product_catalog');
    expect(names).toContain('send_notification');
  });

  it('dispatches get_store_metrics through tool dispatcher', async () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const result = await registry.execute('get_store_metrics', { storeId: 'store-1' }, {
      userId: 'user-1',
    });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ toolName: 'get_store_analytics' });
  });
});
