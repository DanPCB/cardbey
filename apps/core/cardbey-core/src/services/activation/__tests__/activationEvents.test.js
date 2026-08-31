import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeActivationEvent,
  recordActivationEvent,
  loadActivationFunnel,
} from '../activationEvents.js';

describe('activationEvents', () => {
  it('rejects unknown event types', () => {
    const evt = normalizeActivationEvent({ eventType: 'CLICK', capability: 'miniweb' });
    expect(evt.eventType).toBeNull();
  });

  it('records then dedupes the same anonymous event in the window', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-act-'));
    const filePath = join(dir, 'events.json');
    const now = Date.parse('2026-08-17T01:00:00.000Z');
    const payload = {
      eventType: 'FIRST_RESULT_CREATED',
      capability: 'miniweb',
      anonymousId: 'viewer-1',
      variant: 'minutes',
      path: '/create',
    };
    const a = await recordActivationEvent(payload, { filePath, now });
    const b = await recordActivationEvent(payload, { filePath, now: now + 1000 });
    expect(a.recorded).toBe(true);
    expect(b.deduped).toBe(true);
    const funnel = await loadActivationFunnel({ filePath });
    expect(funnel.totals.FIRST_RESULT_CREATED).toBe(1);
    expect(funnel.byCapability.miniweb.FIRST_RESULT_CREATED).toBe(1);
    expect(funnel.byVariant.minutes.FIRST_RESULT_CREATED).toBe(1);
    expect(funnel.liveMeta).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
