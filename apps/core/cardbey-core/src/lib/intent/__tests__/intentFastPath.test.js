/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isSimpleGreetingText,
  normalizeIntakeMessageText,
  shouldUseIntentFastPath,
} from '../intentFastPath.js';

describe('intentFastPath', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.DISABLE_LLM_REASONER_FAST_PATH;
    process.env.LLM_REASONER_FAST_PATH_MAX_WORDS = '3';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('normalizeIntakeMessageText', () => {
    it('lowercases and trims punctuation', () => {
      expect(normalizeIntakeMessageText('  Hi!!!  ')).toBe('hi');
      expect(normalizeIntakeMessageText('Hello?')).toBe('hello');
    });
  });

  describe('isSimpleGreetingText', () => {
    it('matches common greetings', () => {
      expect(isSimpleGreetingText('hi')).toBe(true);
      expect(isSimpleGreetingText('Hello!')).toBe(true);
      expect(isSimpleGreetingText('what can you do?')).toBe(true);
    });

    it('rejects non-greetings', () => {
      expect(isSimpleGreetingText('create a store')).toBe(false);
    });
  });

  describe('shouldUseIntentFastPath', () => {
    it('returns true for simple greetings without active mission', () => {
      expect(shouldUseIntentFastPath({ text: 'Hi' }, {})).toBe(true);
      expect(shouldUseIntentFastPath({ text: 'hello' }, {})).toBe(true);
    });

    it('returns true for very short messages (<=3 words)', () => {
      expect(shouldUseIntentFastPath({ text: 'create store' }, {})).toBe(true);
    });

    it('returns false for longer messages', () => {
      expect(
        shouldUseIntentFastPath({ text: 'Create a store called Test' }, {}),
      ).toBe(false);
    });

    it('returns false when active mission is set', () => {
      expect(
        shouldUseIntentFastPath(
          { text: 'hi' },
          { currentContext: { activeMissionId: 'mission_1' } },
        ),
      ).toBe(false);
    });

    it('returns false when attachments are present', () => {
      expect(
        shouldUseIntentFastPath(
          { text: 'hi', attachments: [{ id: '1' }] },
          {},
        ),
      ).toBe(false);
    });

    it('returns false when DISABLE_LLM_REASONER_FAST_PATH is true', () => {
      process.env.DISABLE_LLM_REASONER_FAST_PATH = 'true';
      expect(shouldUseIntentFastPath({ text: 'hi' }, {})).toBe(false);
    });
  });
});
