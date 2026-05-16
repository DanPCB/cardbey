import { describe, expect, it } from 'vitest';
import { reactPlanner } from '../reactPlanner.js';

describe('reactPlanner (Phase 1 decision module)', () => {
  it('fixture 1: delete 3 items in my menu -> ask', async () => {
    const toolRegistry = [
      { toolName: 'generate_slideshow', approvalRequired: false, riskLevel: 'state_change', parameterSchema: { properties: { storeId: { type: 'string' } } } },
    ];
    const out = await reactPlanner({
      userMessage: 'delete 3 items in my menu',
      classification: null,
      context: { storeId: 'store_1' },
      toolRegistry,
    });
    expect(out.kind).toBe('ask');
    expect(out.missing).toContain('itemIds');
    expect(out.prompt.toLowerCase()).toContain('which 3 items');
  });

  it('fixture 2: create a slideshow for this store -> execute generate_slideshow', async () => {
    const toolRegistry = [
      {
        toolName: 'generate_slideshow',
        approvalRequired: false,
        riskLevel: 'safe_read',
        parameterSchema: { required: ['storeId'], properties: { storeId: { type: 'string' } } },
      },
    ];
    const out = await reactPlanner({
      userMessage: 'create a slideshow for this store',
      classification: null,
      context: { storeId: 'store_abc' },
      toolRegistry,
    });
    expect(out).toEqual({
      kind: 'execute',
      toolName: 'generate_slideshow',
      parameters: { storeId: 'store_abc' },
    });
  });

  it('fixture 3: launch a campaign -> confirm launch_campaign', async () => {
    const toolRegistry = [
      {
        toolName: 'launch_campaign',
        approvalRequired: true,
        riskLevel: 'state_change',
        parameterSchema: { required: [], properties: { storeId: { type: 'string' } } },
      },
    ];
    const out = await reactPlanner({
      userMessage: 'launch a campaign',
      classification: { tool: 'launch_campaign' },
      context: { storeId: 'store_1' },
      toolRegistry,
    });
    expect(out.kind).toBe('confirm');
    expect(out.toolName).toBe('launch_campaign');
    expect(out.confirmation.riskLevel).toBe('state_change');
  });

  it('fixture 4: unknown request with no matching tool -> unsupported', async () => {
    const out = await reactPlanner({
      userMessage: 'do something totally unknown',
      classification: null,
      context: { storeId: 'store_1' },
      toolRegistry: [{ toolName: 'generate_slideshow', approvalRequired: false, riskLevel: 'safe_read' }],
    });
    expect(out).toEqual({
      kind: 'unsupported',
      reason: 'no_matching_tool',
      userMessage: 'do something totally unknown',
    });
  });

  it('phase 1.5: missing storeId for generate_slideshow -> ask', async () => {
    const toolRegistry = [
      {
        toolName: 'generate_slideshow',
        approvalRequired: false,
        riskLevel: 'safe_read',
        parameterSchema: { required: ['storeId'], properties: { storeId: { type: 'string' } } },
      },
    ];
    const out = await reactPlanner({
      userMessage: 'create a slideshow for this store',
      classification: null,
      context: {},
      toolRegistry,
    });
    expect(out.kind).toBe('ask');
    expect(out.missing).toContain('storeId');
  });

  it('phase 1.5: state_change tool with approvalRequired -> confirm', async () => {
    const toolRegistry = [
      {
        toolName: 'edit_artifact',
        approvalRequired: true,
        riskLevel: 'state_change',
        parameterSchema: { required: [], properties: { storeId: { type: 'string' } } },
      },
    ];
    const out = await reactPlanner({
      userMessage: 'edit my store copy',
      classification: { tool: 'edit_artifact' },
      context: { storeId: 'store_1' },
      toolRegistry,
    });
    expect(out.kind).toBe('confirm');
    expect(out.toolName).toBe('edit_artifact');
    expect(out.confirmation.riskLevel).toBe('state_change');
  });

  it('phase 1.5: safe_read tool -> execute', async () => {
    const toolRegistry = [
      {
        toolName: 'orders_report',
        approvalRequired: false,
        riskLevel: 'safe_read',
        parameterSchema: { required: [], properties: { storeId: { type: 'string' } } },
      },
    ];
    const out = await reactPlanner({
      userMessage: 'show me my orders',
      classification: { tool: 'orders_report' },
      context: { storeId: 'store_1' },
      toolRegistry,
    });
    expect(out).toEqual({
      kind: 'execute',
      toolName: 'orders_report',
      parameters: { storeId: 'store_1' },
    });
  });

  it('phase 1.5: destructive-sounding request with no tool -> unsupported', async () => {
    const out = await reactPlanner({
      userMessage: 'wipe the database and remove everything',
      classification: null,
      context: { storeId: 'store_1' },
      toolRegistry: [{ toolName: 'orders_report', approvalRequired: false, riskLevel: 'safe_read' }],
    });
    expect(out.kind).toBe('unsupported');
    expect(out.reason).toBe('no_matching_tool');
  });

  it('edge 1: "delete all products" + no delete tool -> unsupported', async () => {
    const out = await reactPlanner({
      userMessage: 'delete all products',
      classification: null,
      context: { storeId: 'store_1' },
      toolRegistry: [{ toolName: 'orders_report', approvalRequired: false, riskLevel: 'safe_read' }],
    });
    expect(out.kind).toBe('unsupported');
  });

  it('edge 4: "delete 3 items" + no item names -> ask', async () => {
    const out = await reactPlanner({
      userMessage: 'delete 3 items',
      classification: null,
      context: { storeId: 'store_1' },
      toolRegistry: [{ toolName: 'orders_report', approvalRequired: false, riskLevel: 'safe_read' }],
    });
    expect(out.kind).toBe('ask');
    expect(out.missing).toContain('itemIds');
  });

  it('edge 6: "connect social account" + missing platform -> ask', async () => {
    const out = await reactPlanner({
      userMessage: 'connect social account',
      classification: { tool: 'connect_social_account' },
      context: { storeId: 'store_1' },
      toolRegistry: [
        {
          toolName: 'connect_social_account',
          approvalRequired: false,
          riskLevel: 'state_change',
          parameterSchema: { required: ['platform'], properties: { platform: { type: 'string' }, storeId: { type: 'string' } } },
        },
      ],
    });
    expect(out.kind).toBe('ask');
    expect(out.missing).toContain('platform');
  });

  it('edge 6: "connect Facebook" -> confirm connect_social_account (state_change)', async () => {
    const out = await reactPlanner({
      userMessage: 'connect Facebook',
      classification: { tool: 'connect_social_account' },
      context: { storeId: 'store_1' },
      toolRegistry: [
        {
          toolName: 'connect_social_account',
          approvalRequired: false,
          riskLevel: 'state_change',
          parameterSchema: { required: ['platform'], properties: { platform: { type: 'string' }, storeId: { type: 'string' } } },
        },
      ],
    });
    expect(out.kind).toBe('confirm');
    expect(out.toolName).toBe('connect_social_account');
    expect(out.parameters.platform).toBe('facebook');
  });

  it('edge 9: "what can you do?" -> execute general_chat (not unsupported)', async () => {
    const out = await reactPlanner({
      userMessage: 'what can you do?',
      classification: null,
      context: {},
      toolRegistry: [{ toolName: 'general_chat', approvalRequired: false, riskLevel: 'safe_read', parameterSchema: { required: [], properties: {} } }],
    });
    expect(out.kind).toBe('execute');
    expect(out.toolName).toBe('general_chat');
  });

  it('edge 7: rewrite_descriptions + storeId + approvalRequired -> confirm', async () => {
    const out = await reactPlanner({
      userMessage: 'rewrite descriptions',
      classification: { tool: 'rewrite_descriptions' },
      context: { storeId: 'store_1' },
      toolRegistry: [
        {
          toolName: 'rewrite_descriptions',
          approvalRequired: true,
          riskLevel: 'state_change',
          parameterSchema: { required: ['storeId'], properties: { storeId: { type: 'string' } } },
        },
      ],
    });
    expect(out.kind).toBe('confirm');
    expect(out.toolName).toBe('rewrite_descriptions');
  });

  it('edge 8: orders_report + no storeId -> ask', async () => {
    const out = await reactPlanner({
      userMessage: 'orders report',
      classification: { tool: 'orders_report' },
      context: {},
      toolRegistry: [
        {
          toolName: 'orders_report',
          approvalRequired: false,
          riskLevel: 'safe_read',
          parameterSchema: { required: ['storeId'], properties: { storeId: { type: 'string' } } },
        },
      ],
    });
    expect(out.kind).toBe('ask');
    expect(out.missing).toContain('storeId');
  });

  it('edge 8: orders_report + storeId -> execute', async () => {
    const out = await reactPlanner({
      userMessage: 'orders report',
      classification: { tool: 'orders_report' },
      context: { storeId: 'store_1' },
      toolRegistry: [
        {
          toolName: 'orders_report',
          approvalRequired: false,
          riskLevel: 'safe_read',
          parameterSchema: { required: ['storeId'], properties: { storeId: { type: 'string' } } },
        },
      ],
    });
    expect(out.kind).toBe('execute');
    expect(out.toolName).toBe('orders_report');
  });
});

