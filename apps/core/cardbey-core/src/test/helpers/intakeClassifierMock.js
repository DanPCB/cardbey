/**
 * Shared partial mock for intakeClassifier used by Performer Intake V2 route tests.
 */
import { vi } from 'vitest';

export function intakeClassifierMockFactory(overrides = {}) {
  return {
    classifyIntent: vi.fn(async () => ({
      executionPath: 'proactive_plan',
      tool: 'general_chat',
      confidence: 0,
      parameters: {},
    })),
    isCampaignOrchestrationIntent: vi.fn(() => false),
    CONFIDENCE: { HIGH: 0.8, MEDIUM: 0.55, LOW: 0 },
    FALLBACK_CLARIFY: { clarifyOptions: [] },
    ...overrides,
  };
}
