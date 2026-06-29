/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentReasoner } from '../intentReasoner.js';
import { isValidIntentType } from '../index.js';

describe('IntentReasoner', () => {
  /** @type {IntentReasoner} */
  let reasoner;
  /** @type {{ getContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;
  /** @type {Record<string, unknown>} */
  let mockContext;

  beforeEach(() => {
    mockContext = {
      activeStoreId: null,
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
      updateContext: vi.fn().mockResolvedValue({}),
      getOrCreateContext: vi.fn().mockResolvedValue(mockContext),
    };

    reasoner = new IntentReasoner({
      contextProvider: mockContextProvider,
      config: {
        minConfidenceThreshold: 0.7,
        minClarificationThreshold: 0.4,
        traceEnabled: true,
        learningEnabled: false,
      },
    });
  });

  it('should return fallback when no context available', async () => {
    mockContextProvider.getContext.mockResolvedValue(null);

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Hello',
    });

    expect(result.intent).toBe('general_chat');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.requiresClarification).toBe(true);
  });

  it('should infer create_store intent', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create a store called My Shop',
    });

    expect(result.intent).toBe('create_store');
    expect(result.tool).toBe('create_store');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.action).toBe('execute_tool');
    expect(isValidIntentType(result.intent)).toBe(true);
  });

  it('should infer add_product intent when user has store', async () => {
    mockContext.activeStoreId = 'store_123';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Add a product',
    });

    expect(result.intent).toBe('add_product');
    expect(result.tool).toBe('replace_store_catalog');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should treat memorySummary store as active store when context engine store is unset', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Add a product',
      memorySummary: { storeId: 'store_from_memory' },
    });

    expect(result.intent).toBe('add_product');
    expect(result.tool).toBe('replace_store_catalog');
    expect(result.userState?.storeId).toBe('store_from_memory');
    expect(result.userState?.hasStore).toBe(true);
  });

  it('should guide guest to sign in when draft store exists and intent is specific', async () => {
    mockContext.activeStoreId = null;
    mockContext.activeDraftId = 'draft_123';

    const result = await reasoner.reason('guest_123', 'session_123', {
      text: 'Add a product to my store',
    });

    expect(result.intent).toBe('guide_to_sign_in');
    expect(result.action).toBe('guide_to_sign_in');
    expect(result.guestGuidance).toBeTruthy();
    expect(result.guestGuidance.requiresSignIn).toBe(true);
    expect(result.suggestedActions).toHaveLength(2);
    expect(result.suggestedActions[0].id).toBe('sign_in');
  });

  it('should clarify vague guest add-product instead of sign-in gate', async () => {
    mockContext.activeDraftId = 'draft_123';

    const result = await reasoner.reason('guest_123', 'session_123', {
      text: 'Add a product',
    });

    expect(result.intent).toBe('add_product');
    expect(result.action).toBe('ask_clarification');
    expect(result.requiresClarification).toBe(true);
    expect(result.clarificationPrompt).toBeTruthy();
  });

  it('should treat currentContext activeStoreId as store when context engine store is unset', async () => {
    mockContext.activeStoreId = null;

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Add a product',
      currentContext: { activeStoreId: 'cmqs9bfcl003bjvow6iv9lbyx' },
    });

    expect(result.intent).toBe('add_product');
    expect(result.tool).toBe('replace_store_catalog');
    expect(result.action).toBe('execute_tool');
    expect(result.parameters?.storeId).toBe('cmqs9bfcl003bjvow6iv9lbyx');
    expect(result.userState?.hasStore).toBe(true);
    expect(result.userState?.storeId).toBe('cmqs9bfcl003bjvow6iv9lbyx');
  });

  it('should treat memory bundle _context.store as active store when other sources unset', async () => {
    mockContext.activeStoreId = null;

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Add a product',
      currentContext: {
        _memoryContext: {
          hasActiveStore: true,
          store: { id: 'store_from_bundle', name: 'My Bakery', category: 'Food', status: 'active' },
        },
      },
    });

    expect(result.intent).toBe('add_product');
    expect(result.userState?.hasStore).toBe(true);
    expect(result.userState?.storeId).toBe('store_from_bundle');
    expect(result.parameters?.storeId).toBe('store_from_bundle');
  });

  it('should ask for clarification when intent is ambiguous', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Upload this file',
      attachments: [{ id: 'att_1', name: 'file.pdf', mimeType: 'application/pdf' }],
    });

    expect(result.requiresClarification).toBe(true);
    expect(result.action).toBe('ask_clarification');
    expect(result.clarificationPrompt).toBeDefined();
    expect(result.suggestedActions).toHaveLength(2);
  });

  it('should route placeholder attachment uploads to ingest_asset_for_intent_detection', async () => {
    mockContext.activeStoreId = 'store_123';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: '(Image attached)',
      originalUserMessage: '(Image attached)',
      imageDataUrl: 'data:image/jpeg;base64,Zm9v',
      attachments: [{ mimeType: 'image/jpeg', base64: 'Zm9v' }],
    });

    expect(result.intent).toBe('analyze_asset');
    expect(result.tool).toBe('ingest_asset_for_intent_detection');
    expect(result.action).toBe('execute_tool');
  });

  it('should detect create_store from shortcutContext', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create store',
      shortcutContext: { type: 'create_store', intentMode: 'website' },
    });

    expect(result.intent).toBe('create_store');
    expect(result.tool).toBe('create_store');
    expect(result.parameters?.intentMode).toBe('website');
  });

  it('should detect promotion graphic fast path when store is active', async () => {
    mockContext.activeStoreId = 'store_123';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create a promotion graphic for my spring collection',
    });

    expect(result.intent).toBe('generate_graphic');
    expect(result.tool).toBe('create_promotion_graphic');
  });

  it('should detect loyalty program fast path when store is active', async () => {
    mockContext.activeStoreId = 'store_123';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'setup a loyalty program for my store',
    });

    expect(result.intent).toBe('setup_loyalty');
    expect(result.tool).toBe('setup_loyalty_program');
  });

  it('should detect analytics fast path when store is active', async () => {
    mockContext.activeStoreId = 'store_123';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'What are my sales?',
    });

    expect(result.intent).toBe('view_analytics');
    expect(result.tool).toBe('get_store_analytics');
  });

  it('should handle asset upload in store creation workflow', async () => {
    mockContext.currentWorkflow = 'store_creation';
    mockContext.activeMissionId = 'mission_123';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: '',
      attachments: [{ id: 'att_1', name: 'logo.png', mimeType: 'image/png' }],
    });

    expect(result.intent).toBe('upload_asset');
    expect(result.tool).toBe('upload_store_asset');
    expect(result.parameters).toHaveProperty('workflow', 'store_creation');
  });

  it('should respect guest constraints for campaigns', async () => {
    mockContext.activeStoreId = null;
    mockContext.activeDraftId = 'draft_123';

    const result = await reasoner.reason('guest_123', 'session_123', {
      text: 'Create a campaign',
    });

    expect(result.intent).toBe('guide_to_sign_in');
    expect(result.guestGuidance.requiresSignIn).toBe(true);
    expect(result.suggestedActions[0].id).toBe('sign_in');
  });

  it('should parse entities from text', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create a store called Golf Tour and add a product called Golf Balls',
    });

    expect(result.parsedInput).toBeTruthy();
    expect(result.parsedInput.entities).toContainEqual(
      expect.objectContaining({ type: 'store', value: 'Golf Tour' }),
    );
  });

  it('should include reasoning trace', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create a store',
    });

    expect(result.trace).toBeTruthy();
    expect(result.trace.reasoningId).toBeDefined();
    expect(result.trace.steps).toBeInstanceOf(Array);
    expect(result.trace.steps.length).toBeGreaterThan(0);
  });

  it('should infer create_store from primaryModeHint even when user already has a store', async () => {
    mockContext.activeStoreId = 'store_existing';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create store: ABC Bakery · Food & drink · Melbourne',
      primaryModeHint: 'store_setup',
      storeCreateForm: {
        storeName: 'ABC Bakery',
        storeType: 'Food & drink',
        location: 'Melbourne',
        intentMode: 'store',
      },
    });

    expect(result.intent).toBe('create_store');
    expect(result.tool).toBe('create_store');
    expect(result.confidence).toBe(1);
    expect(result.action).toBe('execute_tool');
    expect(result.requiresClarification).toBe(false);
  });

  it('should infer create_store from explicit action create_store', async () => {
    mockContext.activeStoreId = 'store_existing';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create store: ABC Bakery · Food & drink · Melbourne',
      action: 'create_store',
      parameters: {
        name: 'ABC Bakery',
        location: 'Melbourne',
        category: 'Food & drink',
      },
    });

    expect(result.intent).toBe('create_store');
    expect(result.tool).toBe('create_store');
    expect(result.confidence).toBe(1);
  });

  it('should infer create_store from Create store: text when user already has a store', async () => {
    mockContext.activeStoreId = 'store_existing';

    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create store: ABC Bakery · Food & drink · Melbourne',
    });

    expect(result.intent).toBe('create_store');
    expect(result.tool).toBe('create_store');
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});
