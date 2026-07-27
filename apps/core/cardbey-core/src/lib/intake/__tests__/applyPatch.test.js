import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { applyPatch } from '../maintenanceTools.js';

function coreSrcRoot() {
  const root = process.env.CARDBEY_MONOREPO_ROOT
    ? path.resolve(process.env.CARDBEY_MONOREPO_ROOT)
    : path.resolve(process.cwd(), '../../..');
  return path.join(root, 'apps/core/cardbey-core/src');
}

describe('applyPatch', () => {
  let tempDir;
  let tempFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-'));
    tempFile = path.join(tempDir, 'sample.ts');
    fs.writeFileSync(tempFile, 'const value = 1;\nconst other = 2;\n', 'utf8');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('rejects empty patch', async () => {
    const out = await applyPatch({ file: tempFile, patch: '', context: {} });
    expect(out.error).toBe('EMPTY_PATCH');
    expect(fs.readFileSync(tempFile, 'utf8')).toContain('const value = 1');
  });

  it('rejects relative path', async () => {
    const out = await applyPatch({ file: 'relative/sample.ts', patch: '- x\n+ y', context: {} });
    expect(out.error).toBe('RELATIVE_PATH_REJECTED');
  });

  it('rejects path outside allowed roots', async () => {
    const outside = path.join(os.tmpdir(), 'outside-repo.ts');
    fs.writeFileSync(outside, 'x\n', 'utf8');
    const out = await applyPatch({ file: outside, patch: '- x\n+ y', context: {} });
    expect(out.error).toBe('PATH_TRAVERSAL_REJECTED');
    fs.unlinkSync(outside);
  });

  it('rejects missing file', async () => {
    const missing = path.join(coreSrcRoot(), '__missing_apply_patch_test__.ts');
    const out = await applyPatch({ file: missing, patch: '- x\n+ y', context: {} });
    expect(out.error).toBe('FILE_NOT_FOUND');
  });

  it('applies patch atomically under allowed root', async () => {
    const allowedFile = path.join(coreSrcRoot(), '__apply_patch_test_fixture__.ts');
    fs.writeFileSync(allowedFile, 'const value = 1;\nconst other = 2;\n', 'utf8');
    const backupFile = `${allowedFile}.patch.bak`;
    const tmpFile = `${allowedFile}.patch.tmp`;

    try {
      const patch = [
        '// Line 1 — test hunk',
        '- const value = 1;',
        '+ const value = 42;',
      ].join('\n');

      const out = await applyPatch({
        file: allowedFile,
        patch,
        context: { errorType: 'react_loop', missionId: 'm-test' },
      });

      expect(out.status).toBe('applied');
      expect(out.hunksApplied).toBe(1);
      expect(fs.existsSync(backupFile)).toBe(true);
      expect(fs.existsSync(tmpFile)).toBe(false);
      expect(fs.readFileSync(allowedFile, 'utf8')).toContain('const value = 42');

      const auditPath = path.join(
        process.env.CARDBEY_MONOREPO_ROOT
          ? path.resolve(process.env.CARDBEY_MONOREPO_ROOT, 'apps/core/cardbey-core')
          : path.resolve(process.cwd()),
        'patches.audit.json',
      );
      if (fs.existsSync(auditPath)) {
        const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
        expect(Array.isArray(audit)).toBe(true);
        expect(audit.some((e) => e.file === allowedFile && e.missionId === 'm-test')).toBe(true);
      }
    } finally {
      for (const f of [allowedFile, backupFile, tmpFile]) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {
          /* ignore */
        }
      }
    }
  });
});
