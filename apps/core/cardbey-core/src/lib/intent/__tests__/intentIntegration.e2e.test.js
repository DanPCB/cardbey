/**
 * Phase 3 — Intent Integration E2E tests (unified reasoner path).
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentIntegration, resetIntentIntegrationForTests } from '../intentIntegration.js';

describe('IntentIntegration E2E', () => {
  /** @type {IntentIntegration} */
  let integration;
  /** @type {Record<string, unknown>} */
  let mockContext;
  /** @type {{ getContext: ReturnType<typeof vi.fn>; getOrCreateContext: ReturnType<typeof vi.fn>; updateContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;
  /** @type {{ session: Record<string, string>; headers: Record<string, string>; user?: { id: string } }} */
  let mockReq;
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    resetIntentIntegrationForTests();
    originalEnv = { ...process.env };

    mockContext = {
      activeStoreId: 'store_123',
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

  describe('unified reasoner path', () => {
    it('should always use IntentReasoner via processIntake', async () => {
      const reasonSpy = vi.spyOn(integration.reasoner, 'reason');

      const result = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Add a product' },
        classifyOpts: { userMessage: 'Add a product' },
        req: mockReq,
      });

      expect(reasonSpy).toHaveBeenCalled();
      expect(result._reasoning).toBeDefined();
      expect(result._classificationSource).toBe('intent_reasoner');
    });

    it('should transform IntentReasoningResult to classification shape', async () => {
      const result = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Create a store called Test' },
        classifyOpts: { userMessage: 'Create a store called Test' },
        req: mockReq,
      });

      expect(result).toHaveProperty('executionPath');
      expect(result).toHaveProperty('tool');
      expect(result).toHaveProperty('parameters');
      expect(result).toHaveProperty('_reasoning');
    });

    it('should handle clarification results', async () => {
      const noStoreContext = {
        ...mockContext,
        activeStoreId: null,
        activeDraftId: null,
      };
      mockContextProvider.getContext.mockResolvedValue(noStoreContext);

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
      expect(result.message).toBeDefined();
      expect(result._reasoning).toHaveProperty('intent');
    });
  });

  describe('Guest flow with draft store', () => {
    beforeEach(() => {
      mockContext = {
        ...mockContext,
        activeStoreId: null,
        activeDraftId: 'draft_123',
        currentWorkflow: 'store_creation_completed',
      };

      mockContextProvider.getContext.mockResolvedValue(mockContext);
    });

    it('should guide guest to sign in when adding product', async () => {
      const guestReq = {
        ...mockReq,
        session: { userId: 'guest_123', sessionId: 'session_123' },
      };

      const result = await integration.processIntake({
        userId: 'guest_123',
        sessionId: 'session_123',
        input: { text: 'Add a product to my store' },
        classifyOpts: { userMessage: 'Add a product to my store' },
        req: guestReq,
      });

      expect(result._requiresSignIn || result._reasoning?.action === 'guide_to_sign_in').toBeTruthy();
    });

    it('should ask for clarification when request is vague', async () => {
      const guestReq = {
        ...mockReq,
        session: { userId: 'guest_123', sessionId: 'session_123' },
      };

      const result = await integration.processIntake({
        userId: 'guest_123',
        sessionId: 'session_123',
        input: { text: 'Add a product' },
        classifyOpts: { userMessage: 'Add a product' },
        req: guestReq,
      });

      expect(result._reasoning?.action).toBe('ask_clarification');
      expect(result.message || result._reasoningResult?.clarificationPrompt).toBeDefined();
    });

    it('should not default to store creation', async () => {
      const guestReq = {
        ...mockReq,
        session: { userId: 'guest_123', sessionId: 'session_123' },
      };

      const result = await integration.processIntake({
        userId: 'guest_123',
        sessionId: 'session_123',
        input: { text: 'Add a product' },
        classifyOpts: { userMessage: 'Add a product' },
        req: guestReq,
      });

      expect(result.tool).not.toBe('create_store');
      expect(result._reasoning?.intent).not.toBe('create_store');
    });
  });

  describe('Signed-in user with store', () => {
    beforeEach(() => {
      mockContext = {
        ...mockContext,
        userId: 'user_123',
        activeStoreId: 'store_123',
        activeDraftId: null,
      };

      mockContextProvider.getContext.mockResolvedValue(mockContext);
    });

    it('should execute product tool directly', async () => {
      const result = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Add a product' },
        classifyOpts: { userMessage: 'Add a product' },
        req: mockReq,
      });

      expect(result.executionPath).toBe('proactive_plan');
      expect(result.tool).toBe('replace_store_catalog');
      expect(result._reasoning?.action).toBe('execute_tool');
    });

    it('should not show sign-in gate', async () => {
      const result = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Add a product' },
        classifyOpts: { userMessage: 'Add a product' },
        req: mockReq,
      });

      expect(result._requiresSignIn).toBeFalsy();
    });
  });

  describe('Signed-in user without store', () => {
    beforeEach(() => {
      mockContext = {
        ...mockContext,
        userId: 'user_123',
        activeStoreId: null,
        activeDraftId: null,
      };

      mockContextProvider.getContext.mockResolvedValue(mockContext);
    });

    it('should guide to create store first', async () => {
      const result = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Add a product to my catalog' },
        classifyOpts: { userMessage: 'Add a product to my catalog' },
        req: mockReq,
      });

      expect(result.tool).not.toBe('replace_store_catalog');
      expect(
        result._reasoning?.intent === 'create_store_first' ||
          result.clarifyOptions?.some((option) => option.id === 'create_store') ||
          result._reasoningResult?.suggestedActions?.some((action) => action.id === 'create_store'),
      ).toBe(true);
    });

    it('should not execute product tool', async () => {
      const result = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Add a product' },
        classifyOpts: { userMessage: 'Add a product' },
        req: mockReq,
      });

      expect(result.tool).not.toBe('replace_store_catalog');
    });
  });

  describe('End-to-end store creation', () => {
    beforeEach(() => {
      mockContext = {
        ...mockContext,
        userId: 'user_123',
        activeStoreId: null,
        activeDraftId: null,
        currentWorkflow: null,
      };

      mockContextProvider.getContext.mockResolvedValue(mockContext);
    });

    it('should create store and update context', async () => {
      const result = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Create a store called Test Store' },
        classifyOpts: { userMessage: 'Create a store called Test Store' },
        req: mockReq,
      });

      expect(result._reasoning?.intent).toBe('create_store');
      expect(result.tool).toBe('create_store');
    });

    it('should set activeStoreId after store creation', async () => {
      const storeId = 'store_new_123';

      mockContext.activeStoreId = storeId;
      mockContextProvider.getContext.mockResolvedValue(mockContext);
      mockContextProvider.updateContext.mockResolvedValue({ activeStoreId: storeId });

      const result2 = await integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Add a product' },
        classifyOpts: { userMessage: 'Add a product' },
        req: mockReq,
      });

      expect(result2._reasoningResult?.userState?.storeId).toBe(storeId);
    });
  });
});
