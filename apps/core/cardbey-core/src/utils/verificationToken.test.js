import { describe, it, expect } from 'vitest';
import {
  normalizeVerificationToken,
  hashVerificationToken,
} from './verificationToken.js';

describe('verificationToken', () => {
  it('normalizes trimmed and percent-encoded tokens', () => {
    const raw = 'abc-def_123XYZ';
    expect(normalizeVerificationToken(`  ${raw}  `)).toBe(raw);
    expect(normalizeVerificationToken(encodeURIComponent(raw))).toBe(raw);
  });

  it('strips line-wrap spaces from email-broken tokens', () => {
    const raw = 'a'.repeat(20) + 'b'.repeat(23);
    expect(normalizeVerificationToken(`${raw.slice(0, 20)} ${raw.slice(20)}`)).toBe(raw);
  });

  it('hashes consistently for base64url characters', () => {
    const token = 'AbCdEf_-0123456789ABCDEFGHIJKLMNOPQRSTUV';
    expect(hashVerificationToken(token)).toHaveLength(64);
    expect(hashVerificationToken(` ${token} `)).toBe(hashVerificationToken(token));
  });

  it('returns null for empty input', () => {
    expect(normalizeVerificationToken('')).toBeNull();
    expect(normalizeVerificationToken(null)).toBeNull();
    expect(hashVerificationToken('')).toBe('');
  });
});
