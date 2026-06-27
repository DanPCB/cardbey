/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Personalization } from '../personalization.js';
import { ModelUpdate } from '../modelUpdate.js';
import { LearningIntegration } from '../learningIntegration.js';

const mockUserProfile = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
};

const mockUserFeedback = {
  create: vi.fn(),
};

const mockBehaviorPattern = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockPerformerSessionContext = {
  findUnique: vi.fn(),
};

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    userProfile: mockUserProfile,
    userFeedback: mockUserFeedback,
    behaviorPattern: mockBehaviorPattern,
    performerSessionContext: mockPerformerSessionContext,
  }),
}));

describe('Learning Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserProfile.findUnique.mockResolvedValue(null);
    mockUserFeedback.create.mockImplementation(async ({ data }) => ({ id: 'fb-1', ...data }));
    mockBehaviorPattern.findMany.mockResolvedValue([]);
    mockBehaviorPattern.findUnique.mockResolvedValue(null);
    mockBehaviorPattern.upsert.mockResolvedValue({});
    mockUserProfile.upsert.mockResolvedValue({});
    mockPerformerSessionContext.findUnique.mockResolvedValue(null);
  });

  describe('Personalization', () => {
    it('enriches context with learned preferences', async () => {
      const personalization = new Personalization();
      mockUserProfile.findUnique.mockResolvedValue({
        userId: 'user-1',
        preferredWorkflows: ['create_store'],
        skippedSteps: ['confirm_branding'],
        frequentlyUsedTools: ['create_campaign'],
        defaultAction: 'execute_tool',
        confidenceCalibration: {
          intentWeights: { create_store: 0.9 },
          toolWeights: {},
          overallBias: 0,
          lastCalibrated: '2026-06-26T00:00:00.000Z',
        },
        learningEnabled: true,
        updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      });

      const profile = await personalization.getProfile('user-1');
      const enriched = personalization.enrichContext(
        { preferences: { language: 'en' } },
        profile,
      );

      expect(enriched.preferredTools).toEqual(['create_campaign']);
      expect(enriched.skippedSteps).toEqual(['confirm_branding']);
      expect(enriched.preferences.frequentlyUsedTools).toEqual(['create_campaign']);
    });

    it('ranks frequently used tools first', () => {
      const personalization = new Personalization();
      const ranked = personalization.rankTools(
        ['general_chat', 'create_campaign', 'create_store'],
        ['create_store', 'create_campaign'],
      );

      expect(ranked).toEqual(['create_store', 'create_campaign', 'general_chat']);
    });
  });

  describe('ModelUpdate', () => {
    it('applies calibrated intent weights to confidence', () => {
      const modelUpdate = new ModelUpdate();
      const tuned = modelUpdate.applyConfidenceTuning(0.8, 'create_store', {
        intentWeights: { create_store: 0.95 },
      });

      expect(tuned).toBeGreaterThan(0.8);
      expect(tuned).toBeLessThanOrEqual(1);
    });

    it('updates intent weights from positive feedback', async () => {
      const modelUpdate = new ModelUpdate();
      mockUserProfile.findUnique.mockResolvedValue({
        confidenceCalibration: {
          intentWeights: { create_store: 0.7 },
          toolWeights: {},
          overallBias: 0,
          lastCalibrated: '2026-06-26T00:00:00.000Z',
        },
      });

      await modelUpdate.updateFromFeedback('user-1', {
        type: 'thumbs_up',
        targetId: 'create_store',
        metadata: { intent: 'create_store' },
      });

      expect(mockUserProfile.upsert).toHaveBeenCalled();
      expect(mockBehaviorPattern.create).toHaveBeenCalled();
    });
  });

  describe('LearningIntegration', () => {
    it('merges learned tuning into reasoning context', async () => {
      const learning = new LearningIntegration({ contextProvider: null, reasoner: null });
      mockUserProfile.findUnique.mockResolvedValue({
        userId: 'user-1',
        preferredWorkflows: ['create_store'],
        skippedSteps: [],
        frequentlyUsedTools: ['create_store'],
        defaultAction: null,
        confidenceCalibration: {
          intentWeights: { create_store: 0.92 },
          toolWeights: {},
          overallBias: 0,
          lastCalibrated: '2026-06-26T00:00:00.000Z',
        },
        learningEnabled: true,
        updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      });
      mockBehaviorPattern.findMany.mockResolvedValue([
        { pattern: 'frequent_tool:create_store', frequency: 3, confidence: 0.8, metadata: {} },
      ]);

      const enhanced = await learning.enhanceReasoning('user-1', 'session-1', { text: 'hi' }, {
        preferences: {},
      });

      expect(enhanced.preferredTools).toEqual(['create_store']);
      expect(enhanced.learning.intentWeights.create_store).toBe(0.92);
    });

    it('records explicit feedback and triggers analysis', async () => {
      const learning = new LearningIntegration({ contextProvider: null, reasoner: null });
      const analyzeSpy = vi.spyOn(learning.analysis, 'analyzeUser').mockResolvedValue(undefined);

      const record = await learning.processFeedback(
        'user-1',
        'session-1',
        { intent: 'create_store', confidence: 0.9, userState: {} },
        'thumbs_up',
      );

      expect(record.type).toBe('thumbs_up');
      expect(mockUserFeedback.create).toHaveBeenCalled();
      expect(analyzeSpy).toHaveBeenCalledWith('user-1', 'session-1');
    });
  });
});
