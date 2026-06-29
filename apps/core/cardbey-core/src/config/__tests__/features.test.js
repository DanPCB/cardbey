import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Features, snapshotFeatures } from '../features.js';

describe('config/features', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('defaults decision loop authority to off', () => {
    delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    expect(Features.decisionLoop.enabled).toBe(false);
  });

  it('enables decision loop when INTAKE_DECISION_LOOP_AUTHORITY=true', () => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
    expect(Features.decisionLoop.enabled).toBe(true);
  });

  it('defaults belief shadow to on', () => {
    delete process.env.INTAKE_BELIEF_SHADOW_ENABLED;
    expect(Features.belief.shadow).toBe(true);
  });

  it('snapshotFeatures returns plain values', () => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
    const snap = snapshotFeatures();
    expect(snap.decisionLoop.enabled).toBe(true);
    expect(typeof snap.decisionLoop.thresholds.low).toBe('number');
  });
});
