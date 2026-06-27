/**
 * Phase 4 — IntentReasoner classification tests (legacy classifier removed).
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentReasoner } from '../intentReasoner.js';

vi.mock('../../llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: vi.fn(async () => {
      throw new Error('LLM should not be called in reasoner classification tests');
    }),
  },
}));

describe('IntentReasoner Classification', () => {
  /** @type {IntentReasoner} */
  let reasoner;
  /** @type {{ getContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;
  /** @type {Record<string, unknown>} */
  let mockContext;

  beforeEach(() => {
    mockContext = {
      activeStoreId: 'store_123',
      activeDraftId: null,
      activeMissionId: null,
      currentWorkflow: null,
      interactions: [],
      preferences: {},
      userId: 'user_123',
      sessionId: 'session_123',
      metadata: { updatedAt: new Date().toISOString() },
    };

    mockContextProvider = {
      getContext: vi.fn().mockResolvedValue(mockContext),
    };

    reasoner = new IntentReasoner({
      contextProvider: mockContextProvider,
      config: {
        minConfidenceThreshold: 0.7,
        minClarificationThreshold: 0.4,
        traceEnabled: false,
        learningEnabled: false,
      },
    });
  });

  it('detects store creation', async () => {
    mockContext.activeStoreId = null;

    const inputs = [
      'Create a store called My Shop',
      'Set up a store',
      'Make a store',
      'Build a store called Test Store',
      'Start a store',
      'New store',
    ];

    for (const text of inputs) {
      const result = await reasoner.reason('user_123', 'session_123', { text });
      expect(result.intent).toBe('create_store');
    }
  });

  it('detects promotion graphic', async () => {
    const inputs = [
      'Create a promotion graphic for my store',
      'Make a promo graphic',
      'Generate a promotion image',
      'Create a promotion graphic for my new spring collection dresses',
    ];

    for (const text of inputs) {
      const result = await reasoner.reason('user_123', 'session_123', { text });
      expect(result.intent).toBe('generate_graphic');
      expect(result.tool).toBe('create_promotion_graphic');
    }
  });

  it('detects loyalty program', async () => {
    const inputs = [
      'Set up a loyalty program',
      'Setup rewards program',
      'Loyalty program for my store',
      'Create customer loyalty program',
    ];

    for (const text of inputs) {
      const result = await reasoner.reason('user_123', 'session_123', { text });
      expect(result.intent).toBe('setup_loyalty');
      expect(result.tool).toBe('setup_loyalty_program');
    }
  });

  it('detects publish store', async () => {
    const inputs = [
      'Publish my store',
      'Go live with my store',
      'Launch my store',
      'Make my store live',
      'Push my store live',
    ];

    for (const text of inputs) {
      const result = await reasoner.reason('user_123', 'session_123', { text });
      expect(result.intent).toBe('publish_store');
      expect(result.tool).toBe('publish_store');
    }
  });

  it('detects analytics', async () => {
    const inputs = [
      'Show me analytics',
      'What are my sales?',
      'View revenue',
      'Store performance report',
      'Show me insights for my store',
    ];

    for (const text of inputs) {
      const result = await reasoner.reason('user_123', 'session_123', { text });
      expect(result.intent).toBe('view_analytics');
      expect(result.tool).toBe('get_store_analytics');
    }
  });

  it('detects document and attachment ingest', async () => {
    const attachment = [{ mimeType: 'image/jpeg', base64: 'Zm9v' }];

    const placeholderResult = await reasoner.reason('user_123', 'session_123', {
      text: '(Image attached)',
      originalUserMessage: '(Image attached)',
      imageDataUrl: 'data:image/jpeg;base64,Zm9v',
      attachments: attachment,
    });
    expect(placeholderResult.intent).toBe('analyze_asset');
    expect(placeholderResult.tool).toBe('ingest_asset_for_intent_detection');

    const docResult = await reasoner.reason('user_123', 'session_123', {
      text: 'ingest this document',
      attachments: attachment,
      imageDataUrl: 'data:image/jpeg;base64,Zm9v',
    });
    expect(docResult.tool).toMatch(/ingest/);
  });

  it('enforces guest gating for publish', async () => {
    mockContext.activeStoreId = null;
    mockContext.activeDraftId = 'draft_123';

    const result = await reasoner.reason('guest_123', 'session_123', {
      text: 'Publish my store',
    });

    expect(result.action).toBe('guide_to_sign_in');
  });
});
