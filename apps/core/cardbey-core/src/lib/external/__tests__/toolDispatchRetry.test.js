import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getRetryableToolNames,
  isToolRetryEnabled,
  isTransientDispatchFailure,
  resetToolDispatchRetryCacheForTests,
  runWithOptionalRetry,
} from '../toolDispatchRetry.js';

describe('toolDispatchRetry', () => {
  const prevTools = process.env.TOOL_DISPATCH_RETRY_TOOLS;
  const prevMax = process.env.TOOL_DISPATCH_RETRY_MAX;
  const prevDelay = process.env.TOOL_DISPATCH_RETRY_DELAY_MS;

  beforeEach(() => {
    resetToolDispatchRetryCacheForTests();
  });

  afterEach(() => {
    if (prevTools === undefined) delete process.env.TOOL_DISPATCH_RETRY_TOOLS;
    else process.env.TOOL_DISPATCH_RETRY_TOOLS = prevTools;
    if (prevMax === undefined) delete process.env.TOOL_DISPATCH_RETRY_MAX;
    else process.env.TOOL_DISPATCH_RETRY_MAX = prevMax;
    if (prevDelay === undefined) delete process.env.TOOL_DISPATCH_RETRY_DELAY_MS;
    else process.env.TOOL_DISPATCH_RETRY_DELAY_MS = prevDelay;
    resetToolDispatchRetryCacheForTests();
  });

  it('parses TOOL_DISPATCH_RETRY_TOOLS', () => {
    process.env.TOOL_DISPATCH_RETRY_TOOLS = 'foo, bar,baz';
    expect(getRetryableToolNames()).toEqual(new Set(['foo', 'bar', 'baz']));
    expect(isToolRetryEnabled('bar')).toBe(true);
    expect(isToolRetryEnabled('other')).toBe(false);
  });

  it('does not retry when tool not listed', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(runWithOptionalRetry('unlisted_tool', fn)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failed results when enabled', async () => {
    process.env.TOOL_DISPATCH_RETRY_TOOLS = 'my_tool';
    process.env.TOOL_DISPATCH_RETRY_MAX = '1';
    process.env.TOOL_DISPATCH_RETRY_DELAY_MS = '0';

    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', error: { code: 'TIMEOUT' } })
      .mockResolvedValueOnce({ status: 'ok', output: { done: true } });

    const result = await runWithOptionalRetry('my_tool', fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ok');
  });

  it('isTransientDispatchFailure detects known codes', () => {
    expect(isTransientDispatchFailure({ status: 'failed', error: { code: 'RATE_LIMIT' } })).toBe(
      true,
    );
    expect(isTransientDispatchFailure({ status: 'failed', error: { code: 'NOT_FOUND' } })).toBe(
      false,
    );
    expect(isTransientDispatchFailure({ status: 'ok' })).toBe(false);
  });
});
