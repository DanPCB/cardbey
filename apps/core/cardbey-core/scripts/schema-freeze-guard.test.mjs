/**
 * Lightweight test for schema-freeze-guard (script lives at repo root scripts/).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('schema-freeze-guard', () => {
  it('passes preflight when schema freeze rules are satisfied', () => {
    expect(() => {
      execSync('node scripts/schema-freeze-guard.mjs', { cwd: repoRoot, stdio: 'pipe' });
    }).not.toThrow();
  });
});
