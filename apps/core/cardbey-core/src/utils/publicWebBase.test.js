import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildPostVerifyDashboardRedirectUrl,
  resolveSafePostVerifyRedirect,
} from './publicWebBase.js';

const KEYS = ['FRONTEND_PUBLIC_URL', 'PUBLIC_APP_URL', 'DASHBOARD_URL', 'NODE_ENV'];

describe('post-verify dashboard redirect', () => {
  const saved = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('builds absolute URL from FRONTEND_PUBLIC_URL', () => {
    process.env.FRONTEND_PUBLIC_URL = 'http://192.168.1.11:5174';
    expect(buildPostVerifyDashboardRedirectUrl()).toBe(
      'http://192.168.1.11:5174/onboarding/business?verified=1',
    );
  });

  it('accepts absolute redirect_uri on allowed dashboard origin', () => {
    process.env.DASHBOARD_URL = 'http://192.168.1.11:5174';
    const target = resolveSafePostVerifyRedirect(
      'http://192.168.1.11:5174/onboarding/business?verified=1',
    );
    expect(target).toBe('http://192.168.1.11:5174/onboarding/business?verified=1');
  });

  it('rejects absolute redirect_uri on API origin', () => {
    process.env.FRONTEND_PUBLIC_URL = 'http://192.168.1.11:5174';
    expect(
      resolveSafePostVerifyRedirect('http://192.168.1.11:3001/onboarding/business?verified=1'),
    ).toBeNull();
  });

  it('resolves relative redirect_uri against dashboard base', () => {
    process.env.FRONTEND_PUBLIC_URL = 'http://192.168.1.11:5174';
    expect(resolveSafePostVerifyRedirect('/onboarding/business?verified=1')).toBe(
      'http://192.168.1.11:5174/onboarding/business?verified=1',
    );
  });
});
