/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentIntegration, resetIntentIntegrationForTests } from '../intentIntegration.js';

describe('IntentIntegration', () => {
  /** @type {IntentIntegration} */
  let integration;
  /** @type {Record<string, unknown>} */
  let mockContext;
  /** @type {{ getContext: ReturnType<typeof vi.fn>; getOrCreateContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;
  /** @type {{ session: Record<string, string>; headers: Record<string, string> }} */
  let mockReq;

  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    resetIntentIntegrationForTests();
    originalEnv = { ...process.env };

    mockContext = {
      activeStoreId: null,
      activeDraftId: null,
      activeMissionId: null,
      currentWorkflow: null,
      interactions: [],
      preferences: {},
      userId: 'user_123',
      sessionId: 'session_123',
    };

    mockContextProvider = {
      getContext: vi.fn().mockResolvedValue(mockContext),
      getOrCreateContext: vi.fn().mockResolvedValue(mockContext),
      updateContext: vi.fn().mockResolvedValue({}),
    };

    mockReq = {
      session: { userId: 'user_123', sessionId: 'session_123' },
      headers: {},
      user: { id: 'user_123' },
    };

    integration = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
      telemetry: { track: vi.fn() },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    resetIntentIntegrationForTests();
    vi.clearAllMocks();
  });

  it('processIntake transforms reasoning into classification shape', async () => {
    const result = await integration.processIntake({
      userId: 'user_123',
      sessionId: 'session_123',
      input: { text: 'Create a store called My Shop' },
      classifyOpts: { userMessage: 'Create a store called My Shop' },
      req: mockReq,
    });

    expect(result).toBeDefined();
    expect(['intent_reasoner', 'fast_path', 'llm_reasoner_fallback']).toContain(
      result._classificationSource,
    );
    expect(result._reasoning).toHaveProperty('intent', 'create_store');
    expect(result.tool).toBe('create_store');
    expect(result.executionPath).toBeTruthy();
  });

  it('processIntake transforms clarification results', async () => {
    process.env.ENABLE_LLM_REASONER = 'false';

    const result = await integration.processIntake({
      userId: 'user_123',
      sessionId: 'session_123',
      input: {
        text: 'Upload this file',
        attachments: [{ id: 'att_1', name: 'file.pdf', mimeType: 'application/pdf' }],
      },
      classifyOpts: { userMessage: 'Upload this file' },
      req: mockReq,
    });

    expect(result.executionPath).toBe('clarify');
    expect(result.message).toBeTruthy();
    expect(result._reasoning).toHaveProperty('intent');
  });

  it('routes attachment-only placeholder uploads through reasoner to ingest_asset', async () => {
    mockContext.activeStoreId = 'store_123';

    const result = await integration.processIntake({
      userId: 'user_123',
      sessionId: 'session_123',
      input: {
        text: '(Image attached)',
        imageDataUrl: 'data:image/jpeg;base64,Zm9v',
        hasAttachment: true,
        attachments: [{ mimeType: 'image/jpeg', base64: 'Zm9v' }],
      },
      classifyOpts: {
        userMessage: '(Image attached)',
        originalUserMessage: '(Image attached)',
        attachments: [{ mimeType: 'image/jpeg', base64: 'Zm9v' }],
        imageDataUrl: 'data:image/jpeg;base64,Zm9v',
      },
      req: mockReq,
    });

    // Deterministic path: analyze_asset → ingest; LLM path may return clarification → general_chat
    expect(['ingest_asset_for_intent_detection', 'upload_store_asset', 'general_chat']).toContain(
      result.tool,
    );
    expect(['direct_action', 'clarify']).toContain(result.executionPath);
    expect(['intent_reasoner', 'fast_path', 'llm_reasoner', 'llm_reasoner_fallback']).toContain(
      result._classificationSource,
    );
    expect(['analyze_asset', 'clarification']).toContain(result._reasoning?.intent);
  });

  it('passes shortcutContext through to the reasoner', async () => {
    const reasonSpy = vi.spyOn(integration.reasoner, 'reason');

    await integration.processIntake({
      userId: 'user_123',
      sessionId: 'session_123',
      input: {
        text: 'Create store',
        shortcutContext: { type: 'create_store', intentMode: 'store' },
      },
      classifyOpts: { userMessage: 'Create store' },
      req: mockReq,
    });

    expect(reasonSpy).toHaveBeenCalledWith(
      'user_123',
      'session_123',
      expect.objectContaining({
        shortcutContext: { type: 'create_store', intentMode: 'store' },
      }),
    );
  });

  it('throws when reasoner fails (no legacy fallback)', async () => {
    vi.spyOn(integration.reasoner, 'reason').mockRejectedValue(new Error('Test error'));

    await expect(
      integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Test' },
        classifyOpts: { userMessage: 'Test' },
        req: mockReq,
      }),
    ).rejects.toThrow('IntentReasoner failed: Test error');
  });
});
