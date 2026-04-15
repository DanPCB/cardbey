/**
 * Foundation 2: makeEmitContextUpdate unit tests.
 * Contract: returns a function; when called with null/non-object it does nothing (no throw).
 * Full behavior (mergeMissionContext + emitMissionEvent) is covered by E2E.
 */

import { describe, it, expect, vi } from 'vitest';
import { makeEmitContextUpdate } from './makeEmitContextUpdate.js';

describe('makeEmitContextUpdate', () => {
  it('returns a function', () => {
    const emitMissionEvent = vi.fn().mockResolvedValue(undefined);
    const fn = makeEmitContextUpdate('mission-1', 'CatalogAgent', emitMissionEvent);
    expect(typeof fn).toBe('function');
  });

  it('no-op when patch is null (resolves without throw)', async () => {
    const emitMissionEvent = vi.fn().mockResolvedValue(undefined);
    const emitContextUpdate = makeEmitContextUpdate('m1', 'CatalogAgent', emitMissionEvent);
    await expect(emitContextUpdate(null)).resolves.toBeUndefined();
  });

  it('no-op when patch is array (resolves without throw)', async () => {
    const emitMissionEvent = vi.fn().mockResolvedValue(undefined);
    const emitContextUpdate = makeEmitContextUpdate('m1', 'CatalogAgent', emitMissionEvent);
    await expect(emitContextUpdate([])).resolves.toBeUndefined();
  });
});
