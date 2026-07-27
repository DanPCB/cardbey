import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { assertSuperAdmin, superAdminOnly } from '../guardPolicy.js';

function makeReq(overrides = {}) {
  return {
    body: {},
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('guardPolicy', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.PERFORMER_MAINTENANCE_SECRET = 'test-secret-token';
    delete process.env.PERFORMER_MAINTENANCE_IP_ALLOWLIST;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('rejects when PERFORMER_MAINTENANCE_SECRET is not set', () => {
    delete process.env.PERFORMER_MAINTENANCE_SECRET;
    const req = makeReq({
      headers: {
        'x-maintenance-token': 'anything',
        'x-performer-role': 'super_admin',
      },
    });

    expect(() => assertSuperAdmin(req)).toThrow('GUARD_POLICY_VIOLATION');
    try {
      assertSuperAdmin(req);
    } catch (err) {
      expect(err.violations.some((v) => v.includes('PERFORMER_MAINTENANCE_SECRET is not set'))).toBe(true);
    }
  });

  it('rejects wrong token', () => {
    const req = makeReq({
      headers: {
        'x-maintenance-token': 'wrong',
        'x-performer-role': 'super_admin',
      },
    });

    expect(() => assertSuperAdmin(req)).toThrow('GUARD_POLICY_VIOLATION');
  });

  it('rejects correct token with wrong role', () => {
    const req = makeReq({
      headers: {
        'x-maintenance-token': 'test-secret-token',
        'x-performer-role': 'operator',
      },
    });

    expect(() => assertSuperAdmin(req)).toThrow('GUARD_POLICY_VIOLATION');
  });

  it('rejects when IP is not in allowlist', () => {
    process.env.PERFORMER_MAINTENANCE_IP_ALLOWLIST = '10.0.0.1';
    const req = makeReq({
      headers: {
        'x-maintenance-token': 'test-secret-token',
        'x-performer-role': 'super_admin',
      },
      socket: { remoteAddress: '192.168.1.5' },
    });

    expect(() => assertSuperAdmin(req)).toThrow('GUARD_POLICY_VIOLATION');
  });

  it('passes with correct token, super_admin role, and no IP allowlist', () => {
    const req = makeReq({
      headers: {
        'x-maintenance-token': 'test-secret-token',
        'x-performer-role': 'super_admin',
      },
    });

    expect(() => assertSuperAdmin(req)).not.toThrow();
  });

  it('passes when IP is in allowlist', () => {
    process.env.PERFORMER_MAINTENANCE_IP_ALLOWLIST = '127.0.0.1,10.0.0.1';
    const req = makeReq({
      headers: {
        'x-maintenance-token': 'test-secret-token',
        'x-performer-role': 'super_admin',
      },
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(() => assertSuperAdmin(req)).not.toThrow();
  });

  it('superAdminOnly returns generic error in production', () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    superAdminOnly(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Access denied.' });
    expect(res.body.violations).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('superAdminOnly includes violations in dev mode', () => {
    process.env.NODE_ENV = 'development';
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    superAdminOnly(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Access denied.');
    expect(Array.isArray(res.body.violations)).toBe(true);
    expect(res.body.violations.length).toBeGreaterThan(0);
    expect(next).not.toHaveBeenCalled();
  });

  it('superAdminOnly calls next when guard passes', () => {
    const req = makeReq({
      headers: {
        'x-maintenance-token': 'test-secret-token',
        'x-performer-role': 'super_admin',
      },
    });
    const res = makeRes();
    const next = vi.fn();

    superAdminOnly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
