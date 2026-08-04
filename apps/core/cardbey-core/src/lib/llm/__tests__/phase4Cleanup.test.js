/**
 * @vitest-environment node
 * Phase 4 — legacy stack cleanup (safe deletions + retained facades)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../../..');

describe('Phase 4 Cleanup', () => {
  it('removes orphan lib/llm/hybridRouter (LLM ensemble — not routing hybrid)', () => {
    const hybridPath = path.join(srcRoot, 'lib/llm/hybridRouter.js');
    expect(fs.existsSync(hybridPath)).toBe(false);
  });

  it('removes lib/llm/cloudAdapter', () => {
    const cloudPath = path.join(srcRoot, 'lib/llm/cloudAdapter.js');
    expect(fs.existsSync(cloudPath)).toBe(false);
  });

  it('keeps lib/routing/hybridRouter (governance / publish path)', () => {
    const routingHybrid = path.join(srcRoot, 'lib/routing/hybridRouter.js');
    expect(fs.existsSync(routingHybrid)).toBe(true);
  });

  it('keeps ai/engines as deprecated gateway-backed facade (callers still exist)', () => {
    const enginesIndex = path.join(srcRoot, 'ai/engines/index.js');
    expect(fs.existsSync(enginesIndex)).toBe(true);
    const text = fs.readFileSync(enginesIndex, 'utf8');
    expect(text).toMatch(/DEPRECATED|legacy facade/i);
    expect(text).toMatch(/llmGateway/);
  });
});
