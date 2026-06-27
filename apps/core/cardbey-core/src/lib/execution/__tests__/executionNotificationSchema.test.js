import { describe, expect, it } from 'vitest';
import {
  buildExecutionNotification,
  canonicalTypeFromLegacy,
  canonicalTypeFromSse,
  EXECUTION_EVENT_TYPES,
} from '../executionNotificationSchema.js';

describe('executionNotificationSchema', () => {
  it('maps legacy blackboard types to canonical', () => {
    expect(canonicalTypeFromLegacy('kernel.dispatch.started')).toBe(EXECUTION_EVENT_TYPES.STARTED);
    expect(canonicalTypeFromSse('mission.checkpoint')).toBe(EXECUTION_EVENT_TYPES.CHECKPOINT_AWAITING);
  });

  it('builds canonical notification envelope', () => {
    const n = buildExecutionNotification('mission.checkpoint', {
      missionId: 'm1',
      checkpoint: { stepId: 's1', prompt: 'Upload logo?' },
    });
    expect(n.type).toBe(EXECUTION_EVENT_TYPES.CHECKPOINT_AWAITING);
    expect(n.missionId).toBe('m1');
    expect(n.legacyType).toBe('mission.checkpoint');
  });
});
