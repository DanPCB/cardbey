import { describe, it, expect } from 'vitest';
import { normalizePathList, normalizeMultilineList } from '../services/normalizeEvidence.js';

describe('normalizeEvidence', () => {
  describe('normalizePathList', () => {
    it('splits space-separated paths', () => {
      const input = 'apps/core/cardbey-core/prisma/sqlite/schema.prisma apps/core/cardbey-core/src/development/ apps/core/cardbey-core/package.json';
      expect(normalizePathList(input)).toEqual([
        'apps/core/cardbey-core/prisma/sqlite/schema.prisma',
        'apps/core/cardbey-core/src/development/',
        'apps/core/cardbey-core/package.json',
      ]);
    });

    it('splits comma-separated paths', () => {
      expect(normalizePathList('a.ts,b.ts,c.ts')).toEqual(['a.ts', 'b.ts', 'c.ts']);
    });

    it('splits newline-separated paths', () => {
      expect(normalizePathList('a.ts\nb.ts\nc.ts')).toEqual(['a.ts', 'b.ts', 'c.ts']);
    });

    it('flattens arrays containing unsplit strings', () => {
      expect(normalizePathList(['a.ts b.ts', 'c.ts'])).toEqual(['a.ts', 'b.ts', 'c.ts']);
    });

    it('returns empty array for undefined/null', () => {
      expect(normalizePathList(undefined)).toEqual([]);
      expect(normalizePathList(null)).toEqual([]);
    });
  });

  describe('normalizeMultilineList', () => {
    it('preserves commas and spaces inside steps', () => {
      expect(normalizeMultilineList('Open the app, navigate to settings\nSave changes')).toEqual([
        'Open the app, navigate to settings',
        'Save changes',
      ]);
    });

    it('accepts an array of steps', () => {
      expect(normalizeMultilineList(['Step one', 'Step two'])).toEqual(['Step one', 'Step two']);
    });
  });
});
