/**
 * Calibration runner for duplicate-sidebar Development Runtime Phase 2.
 *
 * Usage:
 *   pnpm run calibrate:development-runtime
 *   pnpm run calibrate:development-runtime -- --repo-root   # skip git worktree
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDevelopmentStoreForTests } from '../src/development/store/developmentStore.js';
import {
  getDevelopmentOrchestrator,
  resetDevelopmentOrchestratorForTests,
} from '../src/development/orchestrator/DevelopmentOrchestrator.js';
import { cardbeyRepositoryManifest } from '../src/development/repositories/cardbeyRepositoryManifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
process.env.CARDBEY_REPO_ROOT = repoRoot;

const useRepoRoot = process.argv.includes('--repo-root');
if (useRepoRoot) {
  process.env.DEVELOPMENT_USE_REPO_ROOT = '1';
}

interface StepResult {
  step: string;
  ok: boolean;
  detail?: string;
}

function log(step: string, ok: boolean, detail?: string) {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${step}${detail ? ` — ${detail}` : ''}`);
}

async function waitForState(
  missionId: string,
  targets: string[],
  timeoutMs: number,
): Promise<string> {
  const orch = getDevelopmentOrchestrator();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const mission = await orch.getMission(missionId);
    if (mission && targets.includes(mission.state)) return mission.state;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const mission = await orch.getMission(missionId);
  throw new Error(`Timeout waiting for ${targets.join('|')}; last state=${mission?.state}`);
}

async function main(): Promise<void> {
  const results: StepResult[] = [];
  resetDevelopmentStoreForTests();
  resetDevelopmentOrchestratorForTests();
  const orch = getDevelopmentOrchestrator();

  console.log('\n=== Development Runtime Calibration: duplicate-sidebar ===\n');
  console.log(`Repo root: ${cardbeyRepositoryManifest.repoRoot}`);
  console.log(`Workspace mode: ${useRepoRoot ? 'repo-root' : 'git-worktree'}\n`);

  const mission = await orch.createMission({
    type: 'BUG_FIX',
    title: 'Remove duplicate sidebar on Development Runtime page',
    request: 'Fix duplicate console sidebar on /app/development',
    expectedOutcome: '/app/development renders one Console sidebar only',
    observedBehaviour: 'Two vertical sidebar rails visible on /app/development',
    requestedBy: 'calibration-runner',
    executionMode: 'GOVERNED_AUTOMATION',
  });
  results.push({ step: 'Create mission', ok: true, detail: mission.id });

  await orch.freezeEvidence(mission.id, {
    logs: [],
    screenshots: [],
    requestIds: [],
    affectedRoutes: ['/app/development', '/console/development', '/app', '/app/missions'],
    suspectedFiles: [
      'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx',
      'apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleShell.tsx',
      'apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleSidebar.tsx',
      'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx',
      'apps/dashboard/cardbey-marketing-dashboard/src/components/development/DevelopmentTab.tsx',
    ],
    reproductionSteps: [
      'Open /app/development',
      'Observe duplicate sidebar rails',
      'Compare with /app/missions (single rail)',
    ],
    expectedBehaviour: mission.expectedOutcome,
    currentBehaviour: mission.observedBehaviour,
    frozenBy: 'calibration-runner',
  });
  results.push({ step: 'Freeze evidence', ok: true });

  const report = await orch.analyseImpact(mission.id, 'calibration-runner');
  const afterAnalyse = await orch.getMission(mission.id);
  const analyseOk = afterAnalyse?.state === 'AWAITING_DESIGN_APPROVAL' || afterAnalyse?.state === 'IMPACT_ANALYSED';
  results.push({
    step: 'Impact analysis',
    ok: analyseOk,
    detail: `${afterAnalyse?.state}; files=${report.proposedFiles.length}`,
  });

  const design = orch.getLatestDesign(mission.id);
  if (!design) {
    await orch.proposeDesign(mission.id, 'calibration-runner');
  }
  const latestDesign = orch.getLatestDesign(mission.id);
  results.push({
    step: 'Design proposed',
    ok: !!latestDesign,
    detail: latestDesign ? `v${latestDesign.version}` : 'missing',
  });

  await orch.approveDesign(mission.id, {
    approverUserId: 'calibration-owner',
    note: 'Calibration approval',
    designVersion: latestDesign!.version,
  });

  let finalState: string;
  try {
    finalState = await waitForState(
      mission.id,
      ['AWAITING_CODE_REVIEW', 'TEST_FAILED', 'READY_FOR_PR'],
      600000,
    );
  } catch (err) {
    const m = await orch.getMission(mission.id);
    finalState = m?.state ?? 'UNKNOWN';
    results.push({ step: 'Governed automation chain', ok: false, detail: String(err) });
  }

  const checks = orch.getCheckRuns(mission.id);
  const patch = orch.getLatestPatch(mission.id);
  const workspace = orch.getWorkspace(mission.id);

  results.push({ step: 'Workspace prepared', ok: !!workspace, detail: workspace?.branch });
  results.push({
    step: 'Patch created',
    ok: !!patch,
    detail: patch ? `+${patch.linesAdded}/-${patch.linesDeleted}` : undefined,
  });
  results.push({
    step: 'Checks',
    ok: checks.every((c) => c.status === 'PASSED'),
    detail: checks.map((c) => `${c.name}:${c.status}`).join(', ') || 'none',
  });

  if (finalState === 'TEST_FAILED') {
    for (const c of checks.filter((x) => x.status === 'FAILED')) {
      console.error(`\nCheck failed: ${c.name}\n${c.error ?? c.output}\n`);
    }
    results.push({ step: 'Reach AWAITING_CODE_REVIEW', ok: false, detail: finalState });
    printSummary(results);
    process.exit(1);
  }

  if (finalState === 'AWAITING_CODE_REVIEW') {
    await orch.approvePatch(mission.id, {
      reviewerUserId: 'calibration-reviewer',
      note: 'Calibration patch approval',
      patchVersion: 1,
    });
    finalState = (await orch.getMission(mission.id))?.state ?? finalState;
    results.push({ step: 'Patch approved', ok: finalState === 'READY_FOR_PR', detail: finalState });
  }

  const pr = await orch.openPullRequest(mission.id, 'calibration-runner');
  const prOk = pr.errorCode === 'GITHUB_INTEGRATION_NOT_CONFIGURED' || pr.state === 'CREATED';
  results.push({
    step: 'Pull request',
    ok: prOk,
    detail: pr.errorCode ?? pr.prUrl ?? pr.manualCommand?.slice(0, 80),
  });

  const events = orch.getEvents(mission.id);
  results.push({ step: 'Audit events', ok: events.length >= 5, detail: `${events.length} events` });

  printSummary(results);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exit(1);
  }

  console.log('\nCalibration PASSED.\n');
}

function printSummary(results: StepResult[]) {
  console.log('\n--- Calibration summary ---');
  for (const r of results) {
    log(r.step, r.ok, r.detail);
  }
}

main().catch((err) => {
  console.error('\nCalibration FAILED:', err);
  process.exit(1);
});
