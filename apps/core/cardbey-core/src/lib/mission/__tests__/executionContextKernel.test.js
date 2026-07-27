/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchStores: vi.fn(async () => []),
  validateStore: vi.fn(async () => true),
}));

vi.mock('../../intake/resolveStoreAmbiguity.js', () => ({
  fetchUserStoresForDisambiguation: (...args) => mocks.fetchStores(...args),
  validateUserStoreId: (...args) => mocks.validateStore(...args),
}));

import {
  resolveStoreForIntakeTool,
  hydrateStoreHint,
  executionContextQuestionForTool,
} from '../executionContextKernel.js';

const STORES = [
  {
    id: 'store_a',
    name: 'ABC Coffee',
    type: 'cafe',
    city: 'Melbourne',
    primaryColor: '#6F4E37',
    logoUrl: 'https://example.com/a.png',
  },
  {
    id: 'store_b',
    name: 'Pho Chu The',
    type: 'restaurant',
    city: 'Sydney',
  },
];

describe('executionContextKernel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateStore.mockResolvedValue(true);
  });

  it('hydrateStoreHint prefers body.storeId', () => {
    expect(
      hydrateStoreHint({
        body: { storeId: 'from_body' },
        currentContext: { activeStoreId: 'from_ctx' },
        storeId: 'from_legacy',
      }),
    ).toBe('from_body');
  });

  it('resolveStoreForIntakeTool auto-selects single store for campaigns', async () => {
    mocks.fetchStores.mockResolvedValue([STORES[0]]);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'create_campaign',
      userMessage: 'Launch a weekend promo',
    });
    expect(result.resolved).toBe(true);
    expect(result.storeId).toBe('store_a');
    expect(result.executionContext?.selectionMethod).toBe('automatic');
  });

  it('resolveStoreForIntakeTool returns campaign-worded picker when multi-store', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'create_campaign',
      userMessage: 'Launch a weekend promo',
    });
    expect(result.resolved).toBe(false);
    expect(result.clarify?.clarifyType).toBe('execution_context_store_picker');
    expect(result.clarify?.response).toContain('campaign');
  });

  it('multi-store + session activeStoreId alone must confirm — never silent lock', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'setup_loyalty_program',
      userMessage: 'Create loyalty from this card',
      hintedStoreId: 'store_a',
      classification: {
        tool: 'setup_loyalty_program',
        parameters: { activeStoreId: 'store_a' },
      },
    });
    expect(result.resolved).toBe(false);
    expect(result.kind).toBe('confirm_active_space');
    expect(result.clarify?.clarifyType).toBe('active_space_confirm');
    expect(result.clarify?.response).toMatch(/ABC Coffee/i);
  });

  it('multi-store + intent-injected parameters.storeId (from active space) must confirm', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'setup_loyalty_program',
      userMessage: 'Create loyalty from this card',
      hintedStoreId: 'store_a',
      classification: {
        tool: 'setup_loyalty_program',
        // Intent reasoner auto-injects storeId from currentContext — not an owner choice.
        parameters: { storeId: 'store_a' },
      },
    });
    expect(result.resolved).toBe(false);
    expect(result.kind).toBe('confirm_active_space');
    expect(result.clarify?.clarifyType).toBe('active_space_confirm');
  });

  it('multi-store + store name in prompt locks without confirm', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'setup_loyalty_program',
      userMessage: 'Create loyalty for Pho Chu The from this card',
      hintedStoreId: 'store_a',
      classification: {
        tool: 'setup_loyalty_program',
        parameters: { storeId: 'store_a' },
      },
    });
    expect(result.resolved).toBe(true);
    expect(result.storeId).toBe('store_b');
    expect(result.executionContext?.selectionMethod).toBe('explicit_prompt');
  });

  it('multi-store + confirmedActiveSpace locks after Yes', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'setup_loyalty_program',
      userMessage: 'Create loyalty from this card',
      classification: {
        tool: 'setup_loyalty_program',
        parameters: {
          storeId: 'store_a',
          activeStoreId: 'store_a',
          confirmedActiveSpace: true,
          selectionMethod: 'active-space',
        },
      },
    });
    expect(result.resolved).toBe(true);
    expect(result.storeId).toBe('store_a');
    expect(result.executionContext?.selectionMethod).toBe('active-space');
  });

  it('multi-store + manual picker storeId locks without confirm', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'setup_loyalty_program',
      classification: {
        tool: 'setup_loyalty_program',
        parameters: {
          storeId: 'store_b',
          selectionMethod: 'manual',
        },
      },
    });
    expect(result.resolved).toBe(true);
    expect(result.storeId).toBe('store_b');
  });

  it('multi-store + session activeStoreId alone must confirm for campaigns', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveStoreForIntakeTool({
      userId: 'user_1',
      tool: 'create_campaign',
      userMessage: 'Launch a weekend promo',
      hintedStoreId: 'store_a',
      classification: {
        tool: 'create_campaign',
        parameters: { storeId: 'store_a' },
      },
    });
    expect(result.resolved).toBe(false);
    expect(result.kind).toBe('confirm_active_space');
    expect(result.clarify?.clarifyType).toBe('active_space_confirm');
    expect(result.clarify?.response).toMatch(/campaign/i);
  });

  it('pickStoreHintForIntakeTool ignores session storeId until owner confirms', async () => {
    const { pickStoreHintForIntakeTool } = await import('../executionContextKernel.js');
    expect(
      pickStoreHintForIntakeTool({ storeId: 'store_a', activeStoreId: 'store_a' }, 'session_hint'),
    ).toBe('session_hint');
    expect(pickStoreHintForIntakeTool({ storeId: 'store_a' }, null)).toBe(null);
    expect(
      pickStoreHintForIntakeTool(
        { storeId: 'store_a', confirmedActiveSpace: true, selectionMethod: 'active-space' },
        'session_hint',
      ),
    ).toBe('store_a');
  });

  it('executionContextQuestionForTool is tool-aware', () => {
    expect(executionContextQuestionForTool('setup_loyalty_program')).toMatch(/loyalty/i);
    expect(executionContextQuestionForTool('create_campaign')).toMatch(/campaign/i);
  });
});
