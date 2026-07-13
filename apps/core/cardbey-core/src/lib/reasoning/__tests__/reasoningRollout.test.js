/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  isReasoningEnabledForMission,
  reasoningRolloutBucket,
} from '../reasoningRollout.js';

describe('reasoningRollout', () => {
  const prev = {
    active: process.env.PHASE2_ACTIVE_REASONING,
    percent: process.env.PHASE2_REASONING_ROLLOUT_PERCENT,
    stagingOnly: process.env.PHASE2_REASONING_STAGING_ONLY,
    deployEnv: process.env.CARDEY_DEPLOY_ENV,
  };

  beforeEach(() => {
    process.env.PHASE2_ACTIVE_REASONING = 'true';
    process.env.PHASE2_REASONING_STAGING_ONLY = 'false';
    process.env.PHASE2_REASONING_ROLLOUT_PERCENT = '50';
    delete process.env.CARDEY_DEPLOY_ENV;
  });

  afterEach(() => {
    if (prev.active === undefined) delete process.env.PHASE2_ACTIVE_REASONING;
    else process.env.PHASE2_ACTIVE_REASONING = prev.active;
    if (prev.percent === undefined) delete process.env.PHASE2_REASONING_ROLLOUT_PERCENT;
    else process.env.PHASE2_REASONING_ROLLOUT_PERCENT = prev.percent;
    if (prev.stagingOnly === undefined) delete process.env.PHASE2_REASONING_STAGING_ONLY;
    else process.env.PHASE2_REASONING_STAGING_ONLY = prev.stagingOnly;
    if (prev.deployEnv === undefined) delete process.env.CARDEY_DEPLOY_ENV;
    else process.env.CARDEY_DEPLOY_ENV = prev.deployEnv;
  });

  it('returns stable bucket per missionId', () => {
    expect(reasoningRolloutBucket('mission-a')).toBe(reasoningRolloutBucket('mission-a'));
    expect(reasoningRolloutBucket('mission-a')).not.toBe(reasoningRolloutBucket('mission-b'));
  });

  it('excludes missions above rollout percent', () => {
    process.env.PHASE2_REASONING_ROLLOUT_PERCENT = '0';
    expect(isReasoningEnabledForMission('any-mission').enabled).toBe(false);
  });

  it('honors staging-only gate', () => {
    process.env.PHASE2_REASONING_STAGING_ONLY = 'true';
    process.env.PHASE2_REASONING_ROLLOUT_PERCENT = '100';
    expect(isReasoningEnabledForMission('m1').enabled).toBe(false);
    process.env.CARDEY_DEPLOY_ENV = 'staging';
    expect(isReasoningEnabledForMission('m1').enabled).toBe(true);
  });
});
