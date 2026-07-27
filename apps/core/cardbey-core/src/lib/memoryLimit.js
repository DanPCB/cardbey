/**
 * V8 heap limit helpers — read configured limit and actual heap_size_limit.
 */

import v8 from 'v8';

const DEFAULT_HEAP_LIMIT_MB = 8192;

/**
 * @returns {number}
 */
export function parseConfiguredHeapLimitMb() {
  const execMatch = process.execArgv.join(' ').match(/--max-old-space-size=(\d+)/);
  if (execMatch) return Number(execMatch[1]) || DEFAULT_HEAP_LIMIT_MB;

  const optsMatch = String(process.env.NODE_OPTIONS ?? '').match(/--max-old-space-size=(\d+)/);
  if (optsMatch) return Number(optsMatch[1]) || DEFAULT_HEAP_LIMIT_MB;

  return DEFAULT_HEAP_LIMIT_MB;
}

/**
 * @returns {number}
 */
export function getHeapLimitMb() {
  return Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
}
