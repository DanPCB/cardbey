/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { CARDBEY_TRACE_HEADER, getOrCreateCardbeyTraceId } from '../cardbeyTraceId.js';

describe('getOrCreateCardbeyTraceId', () => {
  it('returns a UUID-like id when header is missing', () => {
    const id = getOrCreateCardbeyTraceId({ get: () => undefined });
    expect(id).toMatch(/^[a-f0-9-]{36}$/i);
  });

  it('accepts a valid client header value', () => {
    const id = getOrCreateCardbeyTraceId({
      get: (h) => (h === CARDBEY_TRACE_HEADER ? 'my-trace-abc123' : undefined),
    });
    expect(id).toBe('my-trace-abc123');
  });

  it('ignores too-short header values', () => {
    const id = getOrCreateCardbeyTraceId({
      get: () => 'short',
    });
    expect(id).toMatch(/^[a-f0-9-]{36}$/i);
  });

  it('ignores disallowed characters', () => {
    const id = getOrCreateCardbeyTraceId({
      get: () => 'bad trace with spaces-and-!@#',
    });
    expect(id).toMatch(/^[a-f0-9-]{36}$/i);
  });
});
