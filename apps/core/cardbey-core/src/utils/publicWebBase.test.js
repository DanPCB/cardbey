import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { publicWebBase } from './publicWebBase.js';

const KEYS = ['PUBLIC_APP_URL', 'DASHBOARD_URL', 'NODE_ENV'];

describe('publicWebBase', () => {
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

  it('prefers PUBLIC_APP_URL over DASHBOARD_URL', () => {
    process.env.PUBLIC_APP_URL = 'https://app.example.com/';
    process.env.DASHBOARD_URL = 'https://dash.example.com';
    expect(publicWebBase()).toBe('https://app.example.com');
  });

  it('falls back to DASHBOARD_URL when PUBLIC_APP_URL is unset', () => {
    process.env.DASHBOARD_URL = 'http://192.168.1.11:5174/';
    expect(publicWebBase()).toBe('http://192.168.1.11:5174');
  });

  it('returns localhost default in non-production when env is unset', () => {
    expect(publicWebBase()).toBe('http://localhost:5174');
  });

  it('returns empty string in production when unset and emptyInProductionIfUnset is true', () => {
    process.env.NODE_ENV = 'production';
    expect(publicWebBase({ emptyInProductionIfUnset: true })).toBe('');
  });
});
