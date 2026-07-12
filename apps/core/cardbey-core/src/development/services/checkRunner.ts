/**
 * Run allowed development checks in workspace.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { DevelopmentCheckRun } from '../types/DevelopmentCheckRun.js';
import {
  cardbeyRepositoryManifest,
  type CardbeyCheckId,
} from '../repositories/cardbeyRepositoryManifest.js';

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const started = Date.now();
  const useShell = process.platform === 'win32';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: useShell });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

/** Use repo-root tooling when isolated worktrees lack node_modules. */
export function resolveCheckCwd(workspaceRoot: string, specCwd: string): string {
  const workspaceCwd = path.join(path.resolve(workspaceRoot), specCwd);
  const repoCwd = path.join(cardbeyRepositoryManifest.repoRoot, specCwd);
  const nm = path.join(workspaceCwd, 'node_modules');
  if (fs.existsSync(nm)) return workspaceCwd;
  return repoCwd;
}

export const DUPLICATE_SIDEBAR_CHECK_IDS: CardbeyCheckId[] = [
  'dashboardTests',
  'dashboardTypecheck',
  'dashboardBuild',
  'coreDevelopmentTests',
];

export async function runDevelopmentChecks(input: {
  missionId: string;
  workspaceRoot: string;
  checkIds?: CardbeyCheckId[];
}): Promise<DevelopmentCheckRun[]> {
  const ids = input.checkIds ?? DUPLICATE_SIDEBAR_CHECK_IDS;
  const runs: DevelopmentCheckRun[] = [];
  const artifactDir = path.join(cardbeyRepositoryManifest.workspaceRoot, 'check-artifacts', input.missionId);
  await fs.promises.mkdir(artifactDir, { recursive: true });

  for (const checkId of ids) {
    const spec = cardbeyRepositoryManifest.allowedChecks[checkId];
    if (!spec) continue;
    const cwd = resolveCheckCwd(input.workspaceRoot, spec.cwd);
    const id = `check-${input.missionId}-${checkId}`;
    const startedAt = new Date();

    const run: DevelopmentCheckRun = {
      id,
      missionId: input.missionId,
      type: checkId === 'dashboardBuild' ? 'BUILD' : checkId === 'dashboardTypecheck' ? 'TYPECHECK' : 'UNIT_TEST',
      name: checkId,
      status: 'RUNNING',
      duration: 0,
      output: '',
      startedAt,
    };

    try {
      const result = await runCommand(spec.command, [...spec.args], cwd, spec.timeoutMs);
      const stdoutPath = path.join(artifactDir, `${checkId}.stdout.log`);
      const stderrPath = path.join(artifactDir, `${checkId}.stderr.log`);
      await fs.promises.writeFile(stdoutPath, result.stdout, 'utf-8');
      await fs.promises.writeFile(stderrPath, result.stderr, 'utf-8');

      run.status = result.exitCode === 0 ? 'PASSED' : 'FAILED';
      run.duration = result.durationMs;
      run.output = result.stdout.slice(0, 4000);
      run.error = result.exitCode !== 0 ? result.stderr.slice(0, 2000) : undefined;
      run.completedAt = new Date();
      (run as DevelopmentCheckRun & { commandId?: string; exitCode?: number }).commandId = checkId;
      (run as DevelopmentCheckRun & { exitCode?: number }).exitCode = result.exitCode;
      (run as DevelopmentCheckRun & { stdoutArtifact?: string }).stdoutArtifact = stdoutPath;
      (run as DevelopmentCheckRun & { stderrArtifact?: string }).stderrArtifact = stderrPath;
    } catch (err) {
      run.status = 'FAILED';
      run.error = (err as Error).message;
      run.completedAt = new Date();
    }

    runs.push(run);
  }

  return runs;
}

export function allRequiredChecksPassed(runs: DevelopmentCheckRun[]): boolean {
  return runs.length > 0 && runs.every((r) => r.status === 'PASSED');
}
