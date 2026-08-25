/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runVerifyStep } from '../verifyStep.js';
import { runLearnStep, MissionLearningApi } from '../learnStep.js';

describe('Verify step (Phase 6)', () => {
  it('passes when artifacts are produced and aligned', async () => {
    const result = await runVerifyStep({
      missionId: 'test',
      brief: 'Create a summer promotion graphic',
      artifacts: [{ type: 'graphic', graphicUrl: 'https://example.com/img.jpg' }],
      storeKnowledge: { name: 'Test Cafe', category: 'Food & Drink' },
      blackboard: { appendEvent: vi.fn(async () => ({})) },
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('fails when no artifacts produced', async () => {
    const result = await runVerifyStep({
      missionId: 'test',
      brief: 'Create something',
      artifacts: [],
      storeKnowledge: null,
      blackboard: { appendEvent: vi.fn(async () => ({})) },
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toContain('No artifacts produced by the action agent');
  });
});

describe('Learn step (Phase 6)', () => {
  let tmp;
  const prev = process.env.CARDBEY_CORE_ROOT;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'learn-'));
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.CARDBEY_CORE_ROOT;
    else process.env.CARDBEY_CORE_ROOT = prev;
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  it('records successful mission learning', async () => {
    const record = await MissionLearningApi.recordSuccessfulMission({
      missionId: `ok-${Date.now()}`,
      storeId: 'store-1',
      brief: 'Create a summer campaign graphic',
      artifacts: [{ type: 'graphic' }],
      score: 80,
    });
    expect(record.verifyPassed).toBe(true);
    expect(record.capability).toBe('campaign_creation');
  });

  it('records failed mission when verify fails', async () => {
    const record = await MissionLearningApi.recordFailedMission({
      missionId: `fail-${Date.now()}`,
      storeId: 'store-1',
      brief: 'test brief',
      issues: ['No artifacts'],
      score: 20,
      artifacts: [],
    });
    expect(record.verifyPassed).toBe(false);
    expect(record.outcome).toBe('partial');
  });

  it('runLearnStep writes learn_complete via blackboard', async () => {
    const appendEvent = vi.fn(async () => ({}));
    await runLearnStep({
      missionId: `bb-${Date.now()}`,
      storeId: 'store-1',
      brief: 'analytics report',
      verifyResult: { passed: true, score: 90, issues: [] },
      artifacts: [{ type: 'analytics_report' }],
      blackboard: { appendEvent },
    });
    expect(appendEvent).toHaveBeenCalledWith(
      expect.any(String),
      'learn_complete',
      expect.objectContaining({ outcome: 'success' }),
    );
  });
});
