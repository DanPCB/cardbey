/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildDevAdminUser, resolveDevAdminUserId } from '../devAdminUser.js';

describe('devAdminUser', () => {
  const prev = process.env.DEV_USER_ID;

  afterEach(() => {
    if (prev === undefined) delete process.env.DEV_USER_ID;
    else process.env.DEV_USER_ID = prev;
  });

  it('resolves DEV_USER_ID when set to a real id', () => {
    process.env.DEV_USER_ID = 'cmrg3grrp001sjvkc79bxhyb1';
    expect(resolveDevAdminUserId()).toBe('cmrg3grrp001sjvkc79bxhyb1');
    expect(buildDevAdminUser().id).toBe('cmrg3grrp001sjvkc79bxhyb1');
    expect(buildDevAdminUser().isDevAdmin).toBe(true);
  });

  it('rejects placeholder dev-user-id', () => {
    process.env.DEV_USER_ID = 'dev-user-id';
    expect(() => resolveDevAdminUserId()).toThrow(/DEV_USER_ID must be set/);
  });

  it('rejects missing DEV_USER_ID', () => {
    delete process.env.DEV_USER_ID;
    expect(() => resolveDevAdminUserId()).toThrow(/DEV_USER_ID must be set/);
  });
});
