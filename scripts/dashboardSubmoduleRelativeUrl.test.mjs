import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('dashboard submodule url for Render', () => {
  it('uses relative URL so parent clone credentials can be reused', () => {
    const raw = fs.readFileSync(path.join(repoRoot, '.gitmodules'), 'utf8');
    expect(raw).toMatch(/url\s*=\s*\.\.\/cardbey-marketing-dashboard\.git/);
    expect(raw).not.toMatch(
      /url\s*=\s*https:\/\/github\.com\/DanPCB\/cardbey-marketing-dashboard/,
    );
  });
});
