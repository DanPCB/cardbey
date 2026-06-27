/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentReasoner } from '../intentReasoner.js';

describe('IntentReasoner learning integration', () => {
  /** @type {IntentReasoner} */
  let reasoner;
  /** @type {{ getContext: ReturnType<typeof vi.fn>; recordInteraction: ReturnType<typeof vi.fn> }} */
  let mockContextProvider;

  beforeEach(() => {
    mockContextProvider = {
      getContext: vi.fn().mockResolvedValue({
        activeStoreId: null,
        interactions: [],
        preferences: {},
        userId: 'user_123',
        sessionId: 'session_123',
        metadata: { updatedAt: new Date().toISOString() },
      }),
      recordInteraction: vi.fn().mockResolvedValue(undefined),
    };

    reasoner = new IntentReasoner({
      contextProvider: mockContextProvider,
      config: {
        minConfidenceThreshold: 0.7,
        minClarificationThreshold: 0.4,
        traceEnabled: false,
        learningEnabled: true,
      },
    });

    reasoner.learning.personalization.getProfile = vi.fn().mockResolvedValue({
      userId: 'user_123',
      preferredWorkflows: ['create_store'],
      skippedSteps: [],
      frequentlyUsedTools: ['create_store'],
      defaultAction: null,
      confidenceCalibration: {
        intentWeights: { create_store: 0.95 },
        toolWeights: {},
        overallBias: 0,
        lastCalibrated: '2026-06-26T00:00:00.000Z',
      },
      learningEnabled: true,
      updatedAt: '2026-06-26T00:00:00.000Z',
    });
    reasoner.learning.modelUpdate.getUserTuning = vi.fn().mockResolvedValue({
      intentWeights: { create_store: 0.95 },
      toolWeights: {},
      overallBias: 0,
      patternLibrary: [],
      lastCalibrated: '2026-06-26T00:00:00.000Z',
    });
    reasoner.learning.analysis.analyzeUser = vi.fn().mockResolvedValue(undefined);
    reasoner.learning.processFeedback = vi.fn().mockResolvedValue({ id: 'fb-1' });
    reasoner.learning.processCorrection = vi.fn().mockResolvedValue({ id: 'fb-2' });
  });

  it('applies learned confidence calibration during reasoning', async () => {
    const result = await reasoner.reason('user_123', 'session_123', {
      text: 'Create a store called My Shop',
    });

    expect(result.intent).toBe('create_store');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(
      result.metadata.confidenceFactors.some((factor) => factor.factor === 'learning_calibration'),
    ).toBe(true);
  });

  it('delegates feedback to learning integration', async () => {
    const result = { intent: 'create_store', confidence: 0.9, userState: {} };
    await reasoner.processFeedback('user_123', 'session_123', result, 'thumbs_up');
    expect(reasoner.learning.processFeedback).toHaveBeenCalledWith(
      'user_123',
      'session_123',
      result,
      'thumbs_up',
    );
  });

  it('delegates corrections to learning integration', async () => {
    await reasoner.processCorrection(
      'user_123',
      'session_123',
      'general_chat',
      'create_store',
      { source: 'ui' },
    );
    expect(reasoner.learning.processCorrection).toHaveBeenCalledWith(
      'user_123',
      'session_123',
      'general_chat',
      'create_store',
      { source: 'ui' },
    );
  });

  it('skips learning delegation when disabled', async () => {
    const disabledReasoner = new IntentReasoner({
      contextProvider: mockContextProvider,
      config: { learningEnabled: false },
    });

    await disabledReasoner.processFeedback(
      'user_123',
      'session_123',
      { intent: 'create_store', confidence: 0.9 },
      'thumbs_up',
    );

    expect(disabledReasoner.learning).toBeUndefined();
  });
});
