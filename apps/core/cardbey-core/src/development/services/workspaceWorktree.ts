/**
 * Git worktree workspace preparation for development missions.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cardbeyRepositoryManifest } from '../repositories/cardbeyRepositoryManifest.js';
import { DevelopmentError } from '../errors.js';

function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

export function normalizeBranchName(missionId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const idPart = missionId.replace(/[^a-zA-Z0-9-]/g, '').slice(-12);
  return `fix/dev-${idPart}-${slug || 'mission'}`.slice(0, 80);
}

export interface PrepareWorktreeResult {
  workspacePath: string;
  branchName: string;
  baseBranch: string;
  usedWorktree: boolean;
}

/**
 * Prepare isolated git worktree. Falls back to repo root when git unavailable (tests).
 */
export async function prepareDevelopmentWorktree(input: {
  missionId: string;
  title: string;
  baseBranch?: string;
}): Promise<PrepareWorktreeResult> {
  const baseBranch = input.baseBranch || cardbeyRepositoryManifest.defaultBranch;
  const branchName = normalizeBranchName(input.missionId, input.title);
  const workspaceRoot = cardbeyRepositoryManifest.workspaceRoot;
  const workspacePath = path.join(workspaceRoot, input.missionId);

  if (fs.existsSync(workspacePath)) {
    throw new DevelopmentError(409, 'WORKSPACE_ALREADY_EXISTS', 'Workspace already exists for mission');
  }

  await fs.promises.mkdir(workspaceRoot, { recursive: true });

  if (process.env.DEVELOPMENT_USE_REPO_ROOT === '1') {
    return {
      workspacePath: cardbeyRepositoryManifest.repoRoot,
      branchName,
      baseBranch,
      usedWorktree: false,
    };
  }

  const gitCheck = await runGit(['rev-parse', '--is-inside-work-tree'], cardbeyRepositoryManifest.repoRoot);
  if (gitCheck.exitCode !== 0) {
    return {
      workspacePath: cardbeyRepositoryManifest.repoRoot,
      branchName,
      baseBranch,
      usedWorktree: false,
    };
  }

  const add = await runGit(
    ['worktree', 'add', workspacePath, '-b', branchName, baseBranch],
    cardbeyRepositoryManifest.repoRoot,
  );

  if (add.exitCode !== 0) {
    throw new DevelopmentError(
      500,
      'WORKSPACE_PREPARE_FAILED',
      `git worktree add failed: ${add.stderr || add.stdout}`,
    );
  }

  await ensureDashboardSubmoduleCheckout(workspacePath);

  return { workspacePath, branchName, baseBranch, usedWorktree: true };
}

async function ensureDashboardSubmoduleCheckout(workspacePath: string): Promise<void> {
  const submoduleRel = 'apps/dashboard/cardbey-marketing-dashboard';
  const submodulePath = path.join(workspacePath, submoduleRel);
  const repoSubmodule = path.join(cardbeyRepositoryManifest.repoRoot, submoduleRel);

  const hasSrc = fs.existsSync(path.join(submodulePath, 'src'));
  if (hasSrc) return;

  const init = await runGit(['submodule', 'update', '--init', submoduleRel], workspacePath);
  if (fs.existsSync(path.join(submodulePath, 'src'))) return;

  if (fs.existsSync(path.join(repoSubmodule, 'src'))) {
    await fs.promises.mkdir(path.dirname(submodulePath), { recursive: true });
    await fs.promises.cp(repoSubmodule, submodulePath, { recursive: true });
    return;
  }

  if (init.exitCode !== 0) {
    throw new DevelopmentError(
      500,
      'WORKSPACE_SUBMODULE_INIT_FAILED',
      `Dashboard submodule not available in workspace: ${init.stderr || init.stdout}`,
    );
  }
}

export async function removeDevelopmentWorktree(workspacePath: string, branchName: string): Promise<void> {
  if (workspacePath === cardbeyRepositoryManifest.repoRoot) return;
  await runGit(['worktree', 'remove', workspacePath, '--force'], cardbeyRepositoryManifest.repoRoot);
  await runGit(['branch', '-D', branchName], cardbeyRepositoryManifest.repoRoot).catch(() => undefined);
}

export async function gitCommitAll(workspacePath: string, message: string): Promise<string | null> {
  await runGit(['add', '-A'], workspacePath);
  const commit = await runGit(['commit', '-m', message], workspacePath);
  if (commit.exitCode !== 0) return null;
  const hash = await runGit(['rev-parse', 'HEAD'], workspacePath);
  return hash.exitCode === 0 ? hash.stdout.trim() : null;
}

export async function showGitDiff(workspacePath: string): Promise<string> {
  const diff = await runGit(['diff', 'HEAD'], workspacePath);
  return diff.stdout || diff.stderr || '';
}
