import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentOrchestrator } from '../orchestrator/IntentOrchestrator.js';
import { ContextEvaluator } from '../context/ContextEvaluator.js';

vi.mock('../../lib/intake/accountStoreIntakeGate.js', () => ({
  loadAccountStoreContext: vi.fn(),
  buildPerformerStoreSelectionClarify: vi.fn((opts) => ({
    message: opts.message ?? 'Pick a store',
    options: (opts.stores ?? []).map((s) => ({
      label: s.name,
      tool: opts.lockedTool,
      parameters: { storeId: s.id },
    })),
    storeCandidates: opts.stores,
    pendingIntent: { lockedTool: opts.lockedTool },
  })),
}));

import { loadAccountStoreContext } from '../../lib/intake/accountStoreIntakeGate.js';

describe('IntentOrchestrator', () => {
  beforeEach(() => {
    vi.mocked(loadAccountStoreContext).mockReset();
  });

  it('returns chat for greeting regardless of store count', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 5,
      stores: [
        { id: 's1', name: 'Store 1' },
        { id: 's2', name: 'Store 2' },
        { id: 's3', name: 'Store 3' },
        { id: 's4', name: 'Store 4' },
        { id: 's5', name: 'Store 5' },
      ],
    });

    const orchestrator = new IntentOrchestrator();
    const result = await orchestrator.process({
      message: 'Hi',
      userId: 'user_1',
    });

    expect(result.intent.type).toBe('greeting');
    expect(result.execution.action).toBe('chat');
    expect(result.context.status).toBe('not_required');
    expect(loadAccountStoreContext).not.toHaveBeenCalled();
  });

  it('auto-selects single store for campaign creation', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 1,
      stores: [{ id: 'store-abc', name: 'My Cafe' }],
    });

    const orchestrator = new IntentOrchestrator();
    const result = await orchestrator.process({
      message: 'Create a campaign',
      userId: 'user_1',
    });

    expect(result.intent.type).toBe('create_campaign');
    expect(result.context.status).toBe('ready');
    expect(result.context.storeId).toBe('store-abc');
    expect(result.execution.action).toBe('campaign_creation');
    expect(result.execution.parameters?.storeId).toBe('store-abc');
  });

  it('guides to store creation when no stores exist', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: false,
      storeCount: 0,
      stores: [],
    });

    const orchestrator = new IntentOrchestrator();
    const result = await orchestrator.process({
      message: 'Create a campaign',
      userId: 'user_1',
    });

    expect(result.context.status).toBe('needs_store_creation');
    expect(result.execution.action).toBe('create_store');
    expect(result.execution.parameters?.deferredIntent).toBe('create_campaign');
  });

  it('shows store picker for multi-store campaign intent', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 3,
      stores: [
        { id: 's1', name: 'A' },
        { id: 's2', name: 'B' },
        { id: 's3', name: 'C' },
      ],
    });

    const orchestrator = new IntentOrchestrator();
    const result = await orchestrator.process({
      message: 'Create a campaign',
      userId: 'user_1',
    });

    expect(result.context.status).toBe('needs_store_picker');
    expect(result.execution.action).toBe('store_picker');
    expect(result.execution.clarifyType).toBe('execution_context_store_picker');
  });

  it('skips context load for capabilities with many stores', async () => {
    vi.mocked(loadAccountStoreContext).mockResolvedValue({
      accountHasStores: true,
      storeCount: 5,
      stores: [],
    });

    const orchestrator = new IntentOrchestrator();
    const result = await orchestrator.process({
      message: 'What can you do?',
      userId: 'user_1',
    });

    expect(result.execution.action).toBe('chat');
    expect(loadAccountStoreContext).not.toHaveBeenCalled();
  });
});
