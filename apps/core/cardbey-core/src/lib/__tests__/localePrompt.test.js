import { describe, expect, it } from 'vitest';
import {
  detectMessageLocale,
  isAllowedLocale,
  localeInstruction,
  normalizeLocale,
  resolveIntakeLocale,
} from '../localePrompt.js';

describe('localePrompt', () => {
  it("localeInstruction('vi') returns Vietnamese string", () => {
    const s = localeInstruction('vi');
    expect(s).toContain('Vietnamese');
    expect(s).toContain('IMPORTANT');
  });

  it("localeInstruction('en') returns ''", () => {
    expect(localeInstruction('en')).toBe('');
  });

  it('localeInstruction(undefined) returns empty', () => {
    expect(localeInstruction(undefined)).toBe('');
  });

  it('normalizeLocale maps region codes', () => {
    expect(normalizeLocale('vi-VN')).toBe('vi');
    expect(normalizeLocale('invalid')).toBe('en');
  });

  it('isAllowedLocale validates allowed values', () => {
    expect(isAllowedLocale('vi')).toBe(true);
    expect(isAllowedLocale('fr')).toBe(false);
  });

  it('detectMessageLocale recognizes Vietnamese text', () => {
    expect(detectMessageLocale('Tạo cửa hàng hoa Union Road')).toBe('vi');
    expect(detectMessageLocale('Create my store')).toBe('en');
  });

  it('resolveIntakeLocale prefers VI from message over explicit en', () => {
    expect(resolveIntakeLocale('en', 'Tạo website cho shop')).toBe('vi');
    expect(resolveIntakeLocale('en', 'Create my store')).toBe('en');
  });
});
