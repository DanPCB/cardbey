/**
 * Shared mocks for Performer Intake V2 route tests.
 */
import { vi } from 'vitest';

export function performerIntakeRouteMocks(overrides = {}) {
  return {
    isCampaignOrchestrationIntent: vi.fn(() => false),
    ...overrides,
  };
}

/** @deprecated Use performerIntakeRouteMocks */
export function intakeClassifierMockFactory(overrides = {}) {
  return performerIntakeRouteMocks(overrides);
}
