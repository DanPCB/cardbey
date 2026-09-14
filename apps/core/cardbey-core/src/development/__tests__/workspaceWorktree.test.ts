import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  resolveRepositorySnapshot,
  normalizeBranchName,
} from '../services/workspaceWorktree.js';
import { DevelopmentError } from '../errors.js';

function runCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

async function initRepo(dir: string): Promise<string> {
  await runCommand('git init', dir);
  await runCommand('git config user.email test@test.com', dir);
  await runCommand('git config user.name Test', dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# test', 'utf-8');
  await runCommand('git add README.md', dir);
  await runCommand('git commit -m initial', dir);
  await runCommand('git checkout -b main', dir);
  return dir;
}

describe('workspaceWorktree repository snapshot', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-snapshot-test-'));
    await initRepo(repoRoot);
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('resolveRepositorySnapshot returns the canonical commit SHA of the base branch', async () => {
    const snapshot = await resolveRepositorySnapshot(repoRoot, 'main');
    expect(snapshot.repoRoot).toBe(repoRoot);
    expect(snapshot.baseBranch).toBe('main');
    expect(snapshot.commitHash).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.isClean).toBe(true);
  });

  it('resolveRepositorySnapshot detects a dirty working tree', async () => {
    fs.writeFileSync(path.join(repoRoot, 'dirty.txt'), 'x', 'utf-8');
    const snapshot = await resolveRepositorySnapshot(repoRoot, 'main');
    expect(snapshot.isClean).toBe(false);
  });

  it('resolveRepositorySnapshot throws when base branch does not exist', async () => {
    await expect(resolveRepositorySnapshot(repoRoot, 'nonexistent-branch')).rejects.toBeInstanceOf(
      DevelopmentError,
    );
  });

  it('normalizeBranchName produces a safe branch name within 80 chars', () => {
    const branch = normalizeBranchName('dev-1234567890123', 'Fix something!!! Very long title here');
    expect(branch).toMatch(/^fix\/dev-/);
    expect(branch.length).toBeLessThanOrEqual(80);
    expect(branch).not.toMatch(/!/);
  });
});
