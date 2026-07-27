/**
 * Force / log V8 heap limit as early as possible (import before other app code).
 */

import v8 from 'v8';
import { getHeapLimitMb, parseConfiguredHeapLimitMb } from './memoryLimit.js';

const configuredMb = parseConfiguredHeapLimitMb();

try {
  v8.setFlagsFromString(`--max-old-space-size=${configuredMb}`);
  console.log(`[MEM] Forced V8 memory limit: ${configuredMb}MB`);
} catch (e) {
  console.warn('[MEM] Could not set V8 flags via v8.setFlagsFromString:', e?.message ?? e);
}

console.log(`[MEM] V8 heap limit: ${getHeapLimitMb()}MB`);
