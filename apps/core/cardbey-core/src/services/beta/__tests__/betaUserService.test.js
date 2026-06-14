import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isBetaUser,
  isPILEnabledForUser,
  setCanaryPercentage,
  getCanaryPercentage,
  reloadBetaAllowlist,
  resetCanaryOverrideForTests,
} from '../betaUserService.js';

describe('betaUserService', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    process.env.NODE_ENV = 'production';
    process.env.CARDEY_BETA_PIL_OPEN_STAGING = 'false';
    process.env.CARDEY_BETA_USER_IDS = 'user-a,user-b';
    process.env.CARDEY_BETA_PIL_CANARY_PERCENT = '0';
    reloadBetaAllowlist();
    resetCanaryOverrideForTests();
  });

  afterEach(() => {
    process.env = envBackup;
    reloadBetaAllowlist();
    resetCanaryOverrideForTests();
  });

  it('treats allowlisted users as beta', () => {
    expect(isBetaUser('user-a')).toBe(true);
    expect(isBetaUser('user-x')).toBe(false);
  });

  it('blocks PIL when canary is 0%', () => {
    setCanaryPercentage(0);
    expect(isPILEnabledForUser('user-a')).toBe(false);
  });

  it('enables PIL for all beta users at 100% canary', () => {
    setCanaryPercentage(100);
    expect(isPILEnabledForUser('user-a')).toBe(true);
    expect(isPILEnabledForUser('user-x')).toBe(false);
  });

  it('applies stable canary bucketing', () => {
    setCanaryPercentage(50);
    const a = isPILEnabledForUser('user-a');
    const aAgain = isPILEnabledForUser('user-a');
    expect(a).toBe(aAgain);
  });

  it('opens rollout on staging flag', () => {
    process.env.CARDEY_BETA_PIL_OPEN_STAGING = 'true';
    reloadBetaAllowlist();
    setCanaryPercentage(0);
    expect(isPILEnabledForUser('any-user')).toBe(true);
  });

  it('reads canary from env when no runtime override', () => {
    process.env.CARDEY_BETA_PIL_CANARY_PERCENT = '25';
    resetCanaryOverrideForTests();
    expect(getCanaryPercentage()).toBe(25);
  });
});
