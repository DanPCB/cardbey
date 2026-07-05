import { describe, it, expect, vi } from 'vitest';
import { buildIntakeReactPlannerRegistry, runPostClassifyReactPlanner } from '../reactPlannerBridge.js';
import { reactPlanner } from '../reactPlanner.js';

describe('reactPlannerBridge', () => {
  it('builds registry with requiresStore → storeId required', () => {
    const registry = buildIntakeReactPlannerRegistry();
    const loyalty = registry.find((t) => t.toolName === 'setup_loyalty_program');
    expect(loyalty).toBeTruthy();
    expect(loyalty?.parameterSchema?.required).toContain('storeId');
  });

  it('returns null for clarify classifications', async () => {
    const out = await runPostClassifyReactPlanner({
      userMessage: 'hello',
      classification: { executionPath: 'clarify', tool: 'general_chat' },
      context: {},
    });
    expect(out).toBeNull();
  });

  it('asks for store when loyalty tool classified without store context', async () => {
    const out = await runPostClassifyReactPlanner({
      userMessage: 'setup a loyalty program',
      classification: {
        executionPath: 'proactive_plan',
        tool: 'setup_loyalty_program',
        confidence: 0.9,
        parameters: {},
      },
      context: { storeId: null },
      hydratedContext: {
        message: 'setup a loyalty program',
        entities: {},
        episodic: [],
        working: {},
        resolution: { errors: [] },
      },
    });
    expect(out?.kind).toBe('ask');
    expect(out?.missing).toContain('storeId');
  });

  it('bypasses reactPlanner for create_store classifications', async () => {
    const out = await runPostClassifyReactPlanner({
      userMessage: 'My Beauty · Beauty · Melbourne',
      classification: {
        executionPath: 'proactive_plan',
        tool: 'create_store',
        confidence: 1,
        parameters: {
          storeName: 'My Beauty',
          storeType: 'Beauty',
          location: 'Melbourne',
          _autoSubmit: true,
        },
      },
      context: { storeId: 'store_existing' },
      hydratedContext: {
        message: 'My Beauty · Beauty · Melbourne',
        entities: {},
        episodic: [],
        working: {},
        resolution: {
          errors: [{ entityType: 'product', ref: 'My Beauty', reason: 'NOT_FOUND' }],
        },
      },
    });
    expect(out).toBeNull();
  });

  it('bypasses reactPlanner for kernel_dispatch create_campaign', async () => {
    const out = await runPostClassifyReactPlanner({
      userMessage: 'create a weekend brunch promotion campaign for my store',
      classification: {
        executionPath: 'kernel_dispatch',
        tool: 'create_campaign',
        confidence: 1,
        parameters: {},
      },
      context: { storeId: null },
      hydratedContext: {
        message: 'create a weekend brunch promotion campaign for my store',
        entities: {},
        episodic: [],
        working: {},
        resolution: {
          errors: [
            {
              entityType: 'store',
              ref: 'store',
              reason: 'AMBIGUOUS',
              candidates: [{ id: 's1', name: 'Store A' }],
            },
          ],
        },
      },
    });
    expect(out).toBeNull();
  });
});

describe('reactPlanner graphic policy', () => {
  it('does not fast-path document ingestion for promotion graphic phrasing', async () => {
    const out = await reactPlanner({
      userMessage: 'Create a promotion graphic for spring dresses',
      classification: { tool: 'create_promotion_graphic' },
      context: {
        storeId: 'store-1',
        attachments: [{ base64: 'Zm9v', mimeType: 'image/jpeg' }],
      },
      toolRegistry: buildIntakeReactPlannerRegistry(),
    });
    expect(out?.toolName).not.toBe('ingest_document');
    if (out?.kind === 'execute') {
      expect(out.toolName).toBe('create_promotion_graphic');
    }
  });
});
