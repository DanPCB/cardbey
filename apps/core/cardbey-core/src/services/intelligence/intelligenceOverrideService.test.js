import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  validateIntelligenceOverridePayload,
  getFleetIntelligenceOverrides,
  setFleetIntelligenceOverrides,
  INTELLIGENCE_OVERRIDE_SINGLETON_ID,
} from './intelligenceOverrideService.js';

describe('intelligenceOverrideService', () => {
  describe('validateIntelligenceOverridePayload', () => {
    it('accepts force-false overrides for allowed keys', () => {
      const result = validateIntelligenceOverridePayload({
        foundation: false,
        surfacePil: false,
      });
      expect(result.ok).toBe(true);
      expect(result.overrides).toEqual({ foundation: false, surfacePil: false });
    });

    it('rejects unknown keys', () => {
      const result = validateIntelligenceOverridePayload({ mysteryFlag: false });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('unknown_key');
    });

    it('rejects non-boolean values', () => {
      const result = validateIntelligenceOverridePayload({ foundation: 'no' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('invalid_type');
    });

    it('rejects true values (force-false-only)', () => {
      const result = validateIntelligenceOverridePayload({ foundation: true });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('force_false_only');
    });
  });

  describe('persistence', () => {
    let store;
    let prisma;

    beforeEach(() => {
      store = null;
      prisma = {
        intelligenceOverride: {
          findUnique: async () => store,
          upsert: async ({ create, update }) => {
            store = store ? { ...store, ...update } : { ...create };
            return store;
          },
        },
      };
    });

    it('returns {} when no row exists', async () => {
      expect(await getFleetIntelligenceOverrides(prisma)).toEqual({});
    });

    it('persists and reads overrides', async () => {
      await setFleetIntelligenceOverrides({ surfacePil: false }, 'admin-1', prisma);
      expect(await getFleetIntelligenceOverrides(prisma)).toEqual({ surfacePil: false });
      expect(store.id).toBe(INTELLIGENCE_OVERRIDE_SINGLETON_ID);
    });

    it('emits audit log on set', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await setFleetIntelligenceOverrides({ foundation: false }, 'admin-2', prisma);
      const audit = logSpy.mock.calls.find((c) => {
        try {
          return JSON.parse(String(c[0])).evt === 'intelligence_override_set';
        } catch {
          return false;
        }
      });
      expect(audit).toBeTruthy();
      const payload = JSON.parse(String(audit[0]));
      expect(payload.actor).toBe('admin-2');
      expect(payload.after).toEqual({ foundation: false });
      logSpy.mockRestore();
    });
  });
});
