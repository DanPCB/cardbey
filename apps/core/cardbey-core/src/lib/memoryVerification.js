/**
 * Verifies V8 heap_size_limit matches the configured --max-old-space-size.
 */

import v8 from 'v8';
import { getHeapLimitMb, parseConfiguredHeapLimitMb } from './memoryLimit.js';

/**
 * @param {number} [expectedMb]
 * @returns {boolean}
 */
export function verifyMemoryLimit(expectedMb = parseConfiguredHeapLimitMb()) {
  const stats = v8.getHeapStatistics();
  const actualLimitMb = getHeapLimitMb();
  const totalHeapMb = Math.round(stats.total_heap_size / 1024 / 1024);
  const usedHeapMb = Math.round(stats.used_heap_size / 1024 / 1024);
  const usagePct =
    actualLimitMb > 0 ? Math.round((usedHeapMb / actualLimitMb) * 100) : 0;

  console.log('[MEM] Heap stats:');
  console.log(`  - Limit: ${actualLimitMb}MB (expected: ${expectedMb}MB)`);
  console.log(`  - Total: ${totalHeapMb}MB`);
  console.log(`  - Used: ${usedHeapMb}MB`);
  console.log(`  - Usage: ${usagePct}%`);

  if (actualLimitMb < expectedMb * 0.5) {
    console.error(`[MEM] WARNING: Heap limit is ${actualLimitMb}MB, expected ${expectedMb}MB`);
    console.error('[MEM] Memory limit may not be applied correctly.');
    return false;
  }

  console.log(`[MEM] Memory limit verified: ${actualLimitMb}MB`);
  return true;
}
