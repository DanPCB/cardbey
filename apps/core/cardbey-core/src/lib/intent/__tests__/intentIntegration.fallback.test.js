/**
 * Phase 3 — IntentIntegration error handling (fail loud, no fallback).
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentIntegration, resetIntentIntegrationForTests } from '../intentIntegration.js';

describe('IntentIntegration error handling', () => {
  /** @type {IntentIntegration} */
  let integration;
  /** @type {{ getContext: ReturnType<typeof vi.fn>; getOrCreateContext: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;
  /** @type {Record<string, unknown>} */
  let mockContext;
  /** @type {{ session: Record<string, string>; headers: Record<string, string> }} */
  let mockReq;

  beforeEach(() => {
    resetIntentIntegrationForTests();

    mockContext = {
      activeStoreId: 'store_123',
      userId: 'user_123',
      sessionId: 'session_123',
    };

    mockContextProvider = {
      getContext: vi.fn().mockResolvedValue(mockContext),
      getOrCreateContext: vi.fn().mockResolvedValue(mockContext),
    };

    mockReq = {
      session: { userId: 'user_123', sessionId: 'session_123' },
      headers: {},
    };

    integration = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
      telemetry: { track: vi.fn() },
    });
  });

  afterEach(() => {
    resetIntentIntegrationForTests();
    vi.clearAllMocks();
  });

  it('throws when IntentReasoner throws', async () => {
    vi.spyOn(integration.reasoner, 'reason').mockRejectedValue(new Error('IntentReasoner test error'));

    await expect(
      integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Test' },
        classifyOpts: { userMessage: 'Test' },
        req: mockReq,
      }),
    ).rejects.toThrow('IntentReasoner failed: IntentReasoner test error');
  });

  it('emits telemetry error event on failure', async () => {
    const telemetry = { track: vi.fn() };

    const integrationWithTelemetry = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
      telemetry,
    });

    vi.spyOn(integrationWithTelemetry.reasoner, 'reason').mockRejectedValue(
      new Error('IntentReasoner test error'),
    );

    await expect(
      integrationWithTelemetry.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Test' },
        classifyOpts: { userMessage: 'Test' },
        req: mockReq,
      }),
    ).rejects.toThrow('IntentReasoner failed');

    expect(telemetry.track).toHaveBeenCalledWith(
      'intent_reasoning.error',
      expect.objectContaining({ error: 'IntentReasoner test error' }),
    );
  });

  it('logs the error before throwing', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const integrationWithLogger = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger,
    });

    vi.spyOn(integrationWithLogger.reasoner, 'reason').mockRejectedValue(
      new Error('IntentReasoner test error'),
    );

    await expect(
      integrationWithLogger.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Test' },
        classifyOpts: { userMessage: 'Test' },
        req: mockReq,
      }),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      '[IntentIntegration] IntentReasoner failed',
      expect.objectContaining({ error: 'IntentReasoner test error' }),
    );
  });

  it('recovers on subsequent successful calls after an error', async () => {
    let callCount = 0;
    vi.spyOn(integration.reasoner, 'reason').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('First call fails'));
      }
      return Promise.resolve({
        intent: 'add_product',
        confidence: 0.9,
        action: 'execute_tool',
        reasoning: ['Recovered'],
        tool: 'replace_store_catalog',
        parameters: { storeId: 'store_123' },
        requiresClarification: false,
        suggestedActions: [],
        userState: { isGuest: false, storeId: 'store_123' },
        metadata: { reasoningTimeMs: 10 },
      });
    });

    await expect(
      integration.processIntake({
        userId: 'user_123',
        sessionId: 'session_123',
        input: { text: 'Test' },
        classifyOpts: { userMessage: 'Test' },
        req: mockReq,
      }),
    ).rejects.toThrow();

    const result2 = await integration.processIntake({
      userId: 'user_123',
      sessionId: 'session_123',
      input: { text: 'Add a product' },
      classifyOpts: { userMessage: 'Add a product' },
      req: mockReq,
    });

    expect(result2._reasoning?.intent).toBe('add_product');
  });

  it('emits telemetry event on successful reasoning', async () => {
    const telemetry = { track: vi.fn() };

    const integrationWithTelemetry = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
      telemetry,
    });

    await integrationWithTelemetry.processIntake({
      userId: 'user_123',
      sessionId: 'session_123',
      input: { text: 'Add a product' },
      classifyOpts: { userMessage: 'Add a product' },
      req: mockReq,
    });

    expect(telemetry.track).toHaveBeenCalledWith(
      'intent_reasoning.completed',
      expect.objectContaining({
        intent: 'add_product',
        confidence: expect.any(Number),
        durationMs: expect.any(Number),
      }),
    );
  });
});
