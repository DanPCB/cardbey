import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  resetBusinessCandidateStoreRootForTests,
  resolveBusinessCandidateStoreRoot,
} from '../businessCandidateStoreRoot.js';

describe('resolveBusinessCandidateStoreRoot', () => {
  let tmpDir = '';
  const prevDir = process.env.BUSINESS_CANDIDATE_DIR;

  beforeEach(async () => {
    resetBusinessCandidateStoreRootForTests();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bc-store-'));
  });

  afterEach(async () => {
    resetBusinessCandidateStoreRootForTests();
    if (prevDir === undefined) delete process.env.BUSINESS_CANDIDATE_DIR;
    else process.env.BUSINESS_CANDIDATE_DIR = prevDir;
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('uses configured BUSINESS_CANDIDATE_DIR when writable', () => {
    process.env.BUSINESS_CANDIDATE_DIR = tmpDir;
    expect(resolveBusinessCandidateStoreRoot()).toBe(tmpDir);
  });

  it('falls back to tmp when configured dir is not writable', async () => {
    const blocked = path.join(tmpDir, 'blocked');
    await writeFile(blocked, 'not-a-directory', 'utf8');
    process.env.BUSINESS_CANDIDATE_DIR = blocked;
    const root = resolveBusinessCandidateStoreRoot();
    expect(root).not.toBe(blocked);
    expect(root).toContain('cardbey');
  });
});
