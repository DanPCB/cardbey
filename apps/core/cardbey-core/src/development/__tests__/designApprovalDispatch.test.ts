/**
 * Regression tests for the design-approval → governed dispatch transition.
 *
 * Reproduces mission dev-1788765599111 (2026-09-07): approving a design for a
 * GOVERNED_AUTOMATION mission while no coding provider was enabled failed the
 * mission terminally with UNSUPPORTED_CODING_PROVIDER, and Kimi was never
 * dispatched. The approval itself (design + review) must remain recorded, and
 * with the Kimi engine enabled the same transition must dispatch to Kimi.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../services/coding/runKimi.js', () => ({
  runKimi: vi.fn(),
}));

vi.mock('../services/coding/kimiMissionProfile.js', () => ({
  prepareKimiMissionProfile: vi.fn(),
}));

vi.mock('../services/workspaceWorktree.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/workspaceWorktree.js')>();
  return { ...actual, prepareDevelopmentWorktree: vi.fn() };
});

vi.mock('../services/checkRunner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/checkRunner.js')>();
  return {
    ...actual,
    runDevelopmentChecks: vi.fn(async () => []),
    allRequiredChecksPassed: vi.fn(() => true),
  };
});

vi.mock('../services/checkMirror.js', () => ({
  mirrorWorkspaceFilesForChecks: vi.fn(async () => undefined),
}));

import { resetDevelopmentStoreForTests, getDevelopmentStore } from '../store/developmentStore.js';
import {
  getDevelopmentOrchestrator,
  resetDevelopmentOrchestratorForTests,
} from '../orchestrator/DevelopmentOrchestrator.js';
import { DevelopmentError } from '../errors.js';
import { prepareDevelopmentWorktree } from '../services/workspaceWorktree.js';
import { prepareKimiMissionProfile } from '../services/coding/kimiMissionProfile.js';
import { runKimi, type RunKimiResult } from '../services/coding/runKimi.js';
import type { DevelopmentImpactReport } from '../types/DevelopmentImpactReport.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';

const mockedPrepareWorktree = vi.mocked(prepareDevelopmentWorktree);
const mockedPrepareProfile = vi.mocked(prepareKimiMissionProfile);
const mockedRunKimi = vi.mocked(runKimi);

const CHANGE_TARGET = 'apps/core/cardbey-core/src/approvalDispatchTarget.ts';

function makeRunKimiResult(overrides: Partial<RunKimiResult> = {}): RunKimiResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    killedByTimeout: false,
    killedBySize: false,
    telemetry: {
      startTime: new Date().toISOString(),
      pid: 12345,
      elapsedMs: 100,
      lastActivityTime: new Date().toISOString(),
      stdoutBytes: 0,
      stderrBytes: 0,
      timeoutMs: 1200000,
      completionReason: 'success',
    },
    ...overrides,
  };
}

function makeImpactReport(missionId: string): DevelopmentImpactReport {
  return {
    id: `imp-${missionId}`,
    missionId,
    affectedSystems: ['backend'],
    observedSystems: ['backend'],
    modifiedSystems: ['backend'],
    canonicalPath: '/',
    legacyPaths: [],
    proposedFiles: [CHANGE_TARGET],
    migrationRequired: false,
    securityReviewRequired: false,
    performanceReviewRequired: false,
    estimatedRisk: 'LOW',
    estimatedEffort: 'SMALL',
    acceptanceCriteria: [],
    findings: [],
    recommendations: [],
    changeSurface: {
      changeTargets: [CHANGE_TARGET],
      contextFiles: [],
      testTargets: [],
      lowRelevance: [],
      lowConfidence: false,
    },
    generatedAt: new Date(),
    generatedBy: 'test',
  };
}

function makeDesign(missionId: string): DevelopmentDesign {
  return {
    id: `design-${missionId}-v1`,
    missionId,
    version: 1,
    summary: 'Verify runtime execution path',
    diagnosis: 'K3 runtime verification only',
    proposedChanges: [{ file: CHANGE_TARGET, purpose: 'verification target', changeType: 'MODIFY' }],
    testPlan: [],
    rollbackPlan: 'Revert branch',
    risks: [],
    proposedBy: 'test-user',
    createdAt: new Date().toISOString(),
  };
}

describe('design approval → governed dispatch transition', () => {
  let workspaceRoot: string;
  let originalKimiFlag: string | undefined;

  async function seedMissionAwaitingApproval(): Promise<string> {
    const orch = getDevelopmentOrchestrator();
    const mission = await orch.createMission({
      type: 'BUG_FIX',
      title: 'Verify Cardbey Development Runtime is executing Kimi K3',
      request:
        'K3 runtime verification only. Inspect the implementation path for Development Runtime Kimi mission execution. Do not modify any files.',
      expectedOutcome: 'Runtime evidence showing the model actually running.',
      requestedBy: 'test-user',
      executionMode: 'GOVERNED_AUTOMATION',
    });
    const store = getDevelopmentStore();
    store.saveImpactReport(makeImpactReport(mission.id));
    store.saveDesign(makeDesign(mission.id));
    store.saveMission({ ...mission, state: 'AWAITING_DESIGN_APPROVAL' });
    return mission.id;
  }

  beforeEach(() => {
    resetDevelopmentStoreForTests();
    resetDevelopmentOrchestratorForTests();

    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-approval-test-'));
    fs.mkdirSync(path.join(workspaceRoot, path.dirname(CHANGE_TARGET)), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, CHANGE_TARGET), 'export const before = true;\n', 'utf-8');

    mockedPrepareWorktree.mockReset();
    mockedPrepareWorktree.mockResolvedValue({
      workspacePath: workspaceRoot,
      branchName: 'fix/test-approval',
      baseBranch: 'main',
      commitHash: 'test-revision',
      usedWorktree: false,
    });

    mockedPrepareProfile.mockReset();
    mockedPrepareProfile.mockResolvedValue({
      kimiHome: path.join(workspaceRoot, '.kimi-code-home'),
      parentHome: '/parent/kimi/home',
      missionStateRoot: path.join(workspaceRoot, '.kimi-state'),
      defaultModel: 'moonshot-ai/kimi-k3',
      providerName: 'moonshot-ai',
    });

    mockedRunKimi.mockReset();

    originalKimiFlag = process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1;
    delete process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1;
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    if (originalKimiFlag === undefined) {
      delete process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1;
    } else {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = originalKimiFlag;
    }
  });

  it('fails terminally with UNSUPPORTED_CODING_PROVIDER when no provider is enabled, keeping the approval recorded', async () => {
    // Exact dev-1788765599111 conditions: Kimi engine flag absent in the server env.
    const missionId = await seedMissionAwaitingApproval();
    const orch = getDevelopmentOrchestrator();

    let err: unknown;
    try {
      await orch.approveDesign(missionId, { approverUserId: 'test-user', designVersion: 1 });
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(DevelopmentError);
    expect((err as DevelopmentError).code).toBe('UNSUPPORTED_CODING_PROVIDER');

    const store = getDevelopmentStore();
    const mission = await orch.getMission(missionId);
    expect(mission?.state).toBe('FAILED');
    expect(mission?.failureReason).toContain('No coding provider available');

    // Governance truth: the approval is not rolled back by the dispatch failure.
    expect(mission?.approvedBy).toBe('test-user');
    expect(mission?.approvedDesignId).toBe(`design-${missionId}-v1`);
    const design = store.getLatestDesign(missionId);
    expect(design?.approvedBy).toBe('test-user');
    expect(design?.approvedAt).toBeDefined();
    expect(
      store.getReviewsForMission(missionId).some((r) => r.type === 'DESIGN' && r.status === 'APPROVED'),
    ).toBe(true);

    // List and detail read the same store — both must agree on FAILED.
    expect(orch.listMissions().find((m) => m.id === missionId)?.state).toBe('FAILED');

    // Kimi dispatch was never reached.
    expect(mockedRunKimi).not.toHaveBeenCalled();
    const eventTypes = orch.getEvents(missionId).map((e) => e.type);
    expect(eventTypes).toContain('development_design_approved');
    expect(eventTypes).toContain('development_workspace_prepared');
    expect(eventTypes).toContain('development_implementation_started');
    expect(eventTypes).not.toContain('development_patch_created');
  });

  it('dispatches to the Kimi provider after approval when the engine is enabled', async () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    const kimiPayload = {
      diagnosis: 'updated target',
      fileChanges: [
        { path: CHANGE_TARGET, changeType: 'MODIFY', after: 'export const after = true;\n' },
      ],
      notes: [],
      scopeExpansionRequested: false,
    };
    mockedRunKimi.mockResolvedValue(
      makeRunKimiResult({ stdout: `\`\`\`json\n${JSON.stringify(kimiPayload)}\n\`\`\`` }),
    );

    const missionId = await seedMissionAwaitingApproval();
    const orch = getDevelopmentOrchestrator();
    const mission = await orch.approveDesign(missionId, {
      approverUserId: 'test-user',
      designVersion: 1,
    });

    // Dispatch reached Kimi inside the mission workspace with the mission-local home.
    expect(mockedRunKimi).toHaveBeenCalledTimes(1);
    const kimiInput = mockedRunKimi.mock.calls[0]![0];
    expect(kimiInput.cwd).toBe(workspaceRoot);
    expect(kimiInput.kimiHome).toBe(path.join(workspaceRoot, '.kimi-code-home'));

    // Governance boundary: approval strictly precedes implementation dispatch.
    const eventTypes = orch.getEvents(missionId).map((e) => e.type);
    expect(eventTypes.indexOf('development_design_approved')).toBeGreaterThanOrEqual(0);
    expect(eventTypes.indexOf('development_design_approved')).toBeLessThan(
      eventTypes.indexOf('development_implementation_started'),
    );
    expect(eventTypes).toContain('development_patch_created');

    expect(mission.state).toBe('AWAITING_CODE_REVIEW');
    const store = getDevelopmentStore();
    const patch = store.getLatestPatch(missionId);
    expect(patch?.filesModified).toContain(CHANGE_TARGET);
    // Changes were applied inside the bounded mission workspace only.
    expect(fs.readFileSync(path.join(workspaceRoot, CHANGE_TARGET), 'utf-8')).toContain('after');
  });
});
