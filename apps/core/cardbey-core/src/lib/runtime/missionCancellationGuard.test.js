import { describe, expect, it } from 'vitest';
import {
  getMissionElapsedMs,
  getMissionTimeoutMs,
  isMissionPipelineActiveStatus,
  isMissionPipelineCancelledRow,
} from './missionCancellationGuard.js';

describe('missionCancellationGuard', () => {
  it('detects cancelled pipeline rows', () => {
    expect(isMissionPipelineCancelledRow({ status: 'cancelled', runState: 'done' })).toBe(true);
    expect(isMissionPipelineCancelledRow({ status: 'executing', runState: 'running' })).toBe(false);
  });

  it('treats active mission statuses as cancellable', () => {
    expect(isMissionPipelineActiveStatus('executing')).toBe(true);
    expect(isMissionPipelineActiveStatus('queued')).toBe(true);
    expect(isMissionPipelineActiveStatus('completed')).toBe(false);
  });

  it('computes elapsed ms from metadata executionStartedAt', () => {
    const started = new Date(Date.now() - 5_000).toISOString();
    const elapsed = getMissionElapsedMs({
      createdAt: new Date(Date.now() - 60_000),
      updatedAt: new Date(),
      metadataJson: { executionStartedAt: started },
    });
    expect(elapsed).toBeGreaterThanOrEqual(4_000);
    expect(elapsed).toBeLessThan(20_000);
  });

  it('defaults timeout to 30 minutes', () => {
    expect(getMissionTimeoutMs()).toBe(30 * 60 * 1000);
  });
});
