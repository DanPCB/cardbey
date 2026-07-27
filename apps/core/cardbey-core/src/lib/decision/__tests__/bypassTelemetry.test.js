import { describe, expect, it, beforeEach } from 'vitest';
import {
  recordIntakeBypass,
  resetIntakeBypassCountsForTests,
  getIntakeBypassCount,
  INTAKE_BYPASS_IDS,
} from '../bypassTelemetry.js';
import { isIntakeBeliefShadowEnabled, isIntakeDecisionLoopAuthorityEnabled } from '../constants.js';

beforeEach(() => {
  resetIntakeBypassCountsForTests();
});

describe('bypassTelemetry', () => {
  it('increments bypass counts', () => {
    recordIntakeBypass(INTAKE_BYPASS_IDS.UPLOAD_ASK_ENFORCE, { reason: 'test' });
    recordIntakeBypass(INTAKE_BYPASS_IDS.UPLOAD_ASK_ENFORCE, { reason: 'test' });
    expect(getIntakeBypassCount(INTAKE_BYPASS_IDS.UPLOAD_ASK_ENFORCE)).toBe(2);
  });
});

describe('decision constants', () => {
  it('belief shadow enabled by default unless env disables', () => {
    const prev = process.env.INTAKE_BELIEF_SHADOW_ENABLED;
    delete process.env.INTAKE_BELIEF_SHADOW_ENABLED;
    expect(isIntakeBeliefShadowEnabled()).toBe(true);
    process.env.INTAKE_BELIEF_SHADOW_ENABLED = 'false';
    expect(isIntakeBeliefShadowEnabled()).toBe(false);
    if (prev === undefined) delete process.env.INTAKE_BELIEF_SHADOW_ENABLED;
    else process.env.INTAKE_BELIEF_SHADOW_ENABLED = prev;
  });

  it('decision loop authority off by default (Phase 3 gate)', () => {
    const prev = process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    expect(isIntakeDecisionLoopAuthorityEnabled()).toBe(false);
    if (prev === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prev;
  });
});
