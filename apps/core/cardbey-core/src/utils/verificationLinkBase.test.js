import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVerificationLinkBaseUrl } from './verificationLinkBase.js';

const ENV_KEYS = [
  'EMAIL_VERIFICATION_BASE_URL',
  'EMAIL_VERIFICATION_API_ORIGIN',
  'CORE_PUBLIC_URL',
  'PUBLIC_API_BASE_URL',
  'PUBLIC_BASE_URL',
  'LOCAL_NETWORK_HOST',
  'NODE_ENV',
  'PORT',
];

describe('getVerificationLinkBaseUrl', () => {
  const saved = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('prefers EMAIL_VERIFICATION_BASE_URL', () => {
    process.env.EMAIL_VERIFICATION_BASE_URL = 'http://192.168.1.11:3001';
    process.env.PUBLIC_API_BASE_URL = 'http://localhost:3001';
    const { base, isFallback } = getVerificationLinkBaseUrl();
    expect(base).toBe('http://192.168.1.11:3001');
    expect(isFallback).toBe(false);
  });

  it('falls back to localhost in test when no env and no LAN override', () => {
    const { base, isFallback, source } = getVerificationLinkBaseUrl();
    expect(base).toBe('http://localhost:3001');
    expect(isFallback).toBe(true);
    expect(source).toBe('localhost-fallback');
  });

  it('uses LOCAL_NETWORK_HOST in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.LOCAL_NETWORK_HOST = '192.168.1.22';
    process.env.PORT = '3001';
    const { base, isFallback, source } = getVerificationLinkBaseUrl();
    expect(base).toBe('http://192.168.1.22:3001');
    expect(isFallback).toBe(false);
    expect(source).toContain('LOCAL_NETWORK');
  });

  it('rejects bases containing /q/', () => {
    process.env.EMAIL_VERIFICATION_BASE_URL = 'http://example.com/q/abc';
    process.env.CORE_PUBLIC_URL = 'http://api.example.com';
    const { base } = getVerificationLinkBaseUrl();
    expect(base).toBe('http://api.example.com:3001');
  });

  it('adds default API port when env URL omits port', () => {
    process.env.EMAIL_VERIFICATION_BASE_URL = 'http://192.168.1.11';
    process.env.PORT = '3001';
    const { base } = getVerificationLinkBaseUrl();
    expect(base).toBe('http://192.168.1.11:3001');
  });
});
