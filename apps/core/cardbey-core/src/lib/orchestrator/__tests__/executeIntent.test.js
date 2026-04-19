/**
 * Phase 0: executeIntent + intent normalization (no DB; optional telemetry via env).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { executeIntent } from '../executeIntent.js';
import { normalizeCanonicalIntent } from '../intentSchema.js';

describe('normalizeCanonicalIntent', () => {
  it('defaults unknown source to system and trims rawInput', () => {
    const n = normalizeCanonicalIntent({ rawInput: '  hello  ', source: 'invalid' });
    expect(n.source).toBe('system');
    expect(n.rawInput).toBe('hello');
  });

  it('accepts api source', () => {
    const n = normalizeCanonicalIntent({ source: 'api', rawInput: 'x' });
    expect(n.source).toBe('api');
  });
});

describe('executeIntent', () => {
  const prevShadow = process.env.EXECUTE_INTENT_SHADOW;

  beforeAll(() => {
    process.env.EXECUTE_INTENT_SHADOW = 'true';
  });

  afterAll(() => {
    if (prevShadow === undefined) delete process.env.EXECUTE_INTENT_SHADOW;
    else process.env.EXECUTE_INTENT_SHADOW = prevShadow;
  });

  it('rejects empty input with EMPTY_INPUT', async () => {
    const res = await executeIntent({ source: 'api', rawInput: '   ' }, { shadow: true });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('EMPTY_INPUT');
    expect(res.planSummary).toBeNull();
    expect(res.shadow).toBe(true);
  });

  it('returns plan summary for create store intent in shadow mode', async () => {
    const res = await executeIntent(
      { source: 'api', rawInput: 'Create a store for my business' },
      { shadow: true },
    );
    expect(res.shadow).toBe(true);
    expect(res.ok).toBe(true);
    expect(res.planSummary).toMatchObject({
      missionType: 'create_store',
      requiresConfirmation: true,
      hasTaskGraph: false,
    });
  });

  it('shadow return shape is stable', async () => {
    const res = await executeIntent({ source: 'chat', rawInput: 'unknown xyz123' }, { shadow: true });
    expect(res).toHaveProperty('ok');
    expect(res).toHaveProperty('shadow', true);
    expect(res).toHaveProperty('planSummary');
    expect(Object.prototype.hasOwnProperty.call(res, 'reason')).toBe(true);
  });

  it('emits INTENT_PLAN_SHADOW log line when env enabled', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await executeIntent({ source: 'api', rawInput: 'create store' }, { shadow: true });
    const jsonLine = spy.mock.calls.map((c) => c[0]).find((l) => typeof l === 'string' && l.includes('INTENT_PLAN_SHADOW'));
    expect(jsonLine).toBeDefined();
    const o = JSON.parse(jsonLine);
    expect(o.tag).toBe('INTENT_PLAN_SHADOW');
    expect(o.source).toBe('api');
    expect(typeof o.inputHash).toBe('string');
    expect(typeof o.planHash).toBe('string');
    expect(o.ok).toBe(true);
    spy.mockRestore();
  });
});
