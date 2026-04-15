/**
 * Agent messages API: validatePayload, validatePayloadByMessageType, text/payload size limits.
 * - validatePayload: type (object/array), JSON size <= 64KB.
 * - validatePayloadByMessageType: normalize/reject by messageType; validationError when coercing.
 */

import { describe, expect, it } from 'vitest';
import { validatePayload, validatePayloadByMessageType } from '../src/routes/agentMessagesRoutes.js';

describe('validatePayload', () => {
  it('accepts null and undefined', () => {
    expect(validatePayload(null)).toEqual({ valid: true });
    expect(validatePayload(undefined)).toEqual({ valid: true });
  });

  it('accepts plain object', () => {
    expect(validatePayload({})).toEqual({ valid: true });
    expect(validatePayload({ a: 1, b: 'x' })).toEqual({ valid: true });
  });

  it('accepts array', () => {
    expect(validatePayload([])).toEqual({ valid: true });
    expect(validatePayload([1, 'x'])).toEqual({ valid: true });
  });

  it('rejects non-object/array types', () => {
    expect(validatePayload('str').valid).toBe(false);
    expect(validatePayload('str').code).toBe('PAYLOAD_INVALID_TYPE');
    expect(validatePayload(42).valid).toBe(false);
    expect(validatePayload(true).valid).toBe(false);
  });

  it('rejects payload over 64KB', () => {
    const big = { x: 'y'.repeat(64 * 1024) };
    const r = validatePayload(big);
    expect(r.valid).toBe(false);
    expect(r.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('accepts payload under 64KB', () => {
    const underLimit = { x: 'y'.repeat(63 * 1024) };
    expect(validatePayload(underLimit).valid).toBe(true);
  });
});

describe('validatePayloadByMessageType', () => {
  it('accepts null/undefined payload', () => {
    expect(validatePayloadByMessageType('text', null)).toEqual({ ok: true, payload: null });
    expect(validatePayloadByMessageType('research_result', undefined)).toEqual({ ok: true, payload: null });
  });

  it('rejects non-object payload for structured types', () => {
    const r = validatePayloadByMessageType('research_result', 'str');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('PAYLOAD_INVALID_TYPE');
  });

  it('normalizes research_result and can set validationError', () => {
    const r = validatePayloadByMessageType('research_result', { summary: 123, citations: 'not-array' });
    expect(r.ok).toBe(true);
    expect(r.payload.summary).toBe('123');
    expect(r.payload.citations).toEqual([]);
    expect(r.validationError).toContain('normalized');
  });

  it('rejects approval_required when options missing or empty', () => {
    expect(validatePayloadByMessageType('approval_required', {}).ok).toBe(false);
    expect(validatePayloadByMessageType('approval_required', { options: [] }).ok).toBe(false);
    const ok = validatePayloadByMessageType('approval_required', { options: [{ id: 'a', label: 'Approve' }] });
    expect(ok.ok).toBe(true);
    expect(ok.payload.options).toHaveLength(1);
  });

  it('normalizes plan_update steps to array of strings', () => {
    const r = validatePayloadByMessageType('plan_update', { steps: 'x' });
    expect(r.ok).toBe(true);
    expect(r.payload.steps).toEqual([]);
    expect(r.validationError).toBeDefined();
  });

  it('passes through text/unknown messageType payload as-is', () => {
    const p = { decidedMessageId: 'm1', optionId: 'o1', optionLabel: 'Yes' };
    expect(validatePayloadByMessageType('text', p)).toEqual({ ok: true, payload: p });
  });
});
