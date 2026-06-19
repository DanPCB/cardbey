import { describe, it, expect } from 'vitest';
import languageValidator, {
  hasMixedLanguage,
  isValidVietnamese,
  validateKeyParity,
} from '../languageValidator.js';

describe('LanguageValidator', () => {
  describe('isValidVietnamese', () => {
    it('returns true for valid Vietnamese', () => {
      expect(isValidVietnamese('Chào mừng bạn')).toBe(true);
      expect(languageValidator.isValidVietnamese('Chào mừng bạn')).toBe(true);
    });

    it('returns false for English', () => {
      expect(isValidVietnamese('Welcome')).toBe(false);
    });

    it('returns true for proper nouns / brands', () => {
      expect(isValidVietnamese('Cardbey')).toBe(true);
    });

    it('returns false when vi matches en (untranslated)', () => {
      expect(isValidVietnamese('Settings', 'Settings')).toBe(false);
    });
  });

  describe('hasMixedLanguage', () => {
    it('detects mixed language', () => {
      expect(hasMixedLanguage('Chào mừng bạn đến với Cardbey platform')).toBe(true);
    });

    it('passes for pure Vietnamese', () => {
      expect(hasMixedLanguage('Chào mừng bạn đến với nền tảng')).toBe(false);
    });
  });

  describe('validateKeyParity', () => {
    it('reports missing and extra keys', () => {
      const result = validateKeyParity(['a', 'b'], ['b', 'c']);
      expect(result.pass).toBe(false);
      expect(result.missingInVi).toEqual(['a']);
      expect(result.extraInVi).toEqual(['c']);
    });

    it('passes when keys match', () => {
      const result = validateKeyParity(['x', 'y'], ['x', 'y']);
      expect(result.pass).toBe(true);
    });
  });
});
