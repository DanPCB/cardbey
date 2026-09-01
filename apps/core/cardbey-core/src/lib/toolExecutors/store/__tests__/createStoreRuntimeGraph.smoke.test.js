/**
 * Vitest wrapper that shells out to plain Node (no Vitest transform) for the smoke script.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');

describe('create-store runtime graph (release integrity gate)', () => {
  it('imports research/location under plain Node and catalog/build under tsx/esm', () => {
    const script = path.join(coreRoot, 'scripts/smoke-create-store-runtime-graph.mjs');
    const result = spawnSync(process.execPath, [script], {
      cwd: coreRoot,
      encoding: 'utf8',
      env: { ...process.env },
    });
    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('gate:create-store-runtime: all required imports OK');
    expect(result.stdout).toContain('phase=tsx-esm');
  });
});
