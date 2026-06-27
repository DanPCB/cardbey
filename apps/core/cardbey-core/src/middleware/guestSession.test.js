import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildGuestCookieOptions, shouldUseCrossSiteGuestCookie } from './guestSession.js';

describe('guestSession cookie options', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses lax cookies on non-production localhost', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.GUEST_COOKIE_SAMESITE;
    expect(shouldUseCrossSiteGuestCookie()).toBe(false);
    expect(buildGuestCookieOptions()).toMatchObject({
      sameSite: 'lax',
      secure: false,
      httpOnly: true,
      path: '/',
    });
  });

  it('uses none+secure on production cross-site deploys', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.GUEST_COOKIE_SAMESITE;
    delete process.env.CARDEY_DEPLOY_ENV;
    expect(shouldUseCrossSiteGuestCookie()).toBe(true);
    expect(buildGuestCookieOptions()).toMatchObject({
      sameSite: 'none',
      secure: true,
      httpOnly: true,
      path: '/',
    });
  });

  it('uses none+secure when NODE_ENV is staging (Render staging core)', () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.GUEST_COOKIE_SAMESITE;
    delete process.env.CARDEY_DEPLOY_ENV;
    expect(shouldUseCrossSiteGuestCookie()).toBe(true);
    expect(buildGuestCookieOptions().sameSite).toBe('none');
    expect(buildGuestCookieOptions().secure).toBe(true);
  });

  it('uses none+secure when CARDEY_DEPLOY_ENV is staging', () => {
    process.env.NODE_ENV = 'development';
    process.env.CARDEY_DEPLOY_ENV = 'staging';
    delete process.env.GUEST_COOKIE_SAMESITE;
    expect(shouldUseCrossSiteGuestCookie()).toBe(true);
    expect(buildGuestCookieOptions().sameSite).toBe('none');
  });

  it('honors GUEST_COOKIE_SAMESITE override', () => {
    process.env.NODE_ENV = 'development';
    process.env.GUEST_COOKIE_SAMESITE = 'none';
    expect(shouldUseCrossSiteGuestCookie()).toBe(true);
    expect(buildGuestCookieOptions().sameSite).toBe('none');
  });
});
