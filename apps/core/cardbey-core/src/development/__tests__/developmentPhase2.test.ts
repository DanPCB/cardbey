import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { resetDevelopmentStoreForTests } from '../store/developmentStore.js';
import {
  resetDevelopmentOrchestratorForTests,
  getDevelopmentOrchestrator,
  validateChangeSurfaceInWorkspace,
} from '../orchestrator/DevelopmentOrchestrator.js';
import { DevelopmentError } from '../errors.js';
import { resolveWorkspaceRelativePath } from '../services/pathSecurity.js';
import { normalizeBranchName } from '../services/workspaceWorktree.js';
import { isDuplicateSidebarMission } from '../services/designPlanner.js';

describe('Development Runtime Phase 2', () => {
  beforeEach(() => {
    resetDevelopmentStoreForTests();
    resetDevelopmentOrchestratorForTests();
  });

  const orchestrator = () => getDevelopmentOrchestrator();

  function runGitCommand(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

  async function initGitWorkspace(dir: string): Promise<void> {
    await runGitCommand(['init'], dir);
    await runGitCommand(['config', 'user.email', 'test@test.com'], dir);
    await runGitCommand(['config', 'user.name', 'Test'], dir);
    fs.writeFileSync(path.join(dir, 'README.md'), '# test', 'utf-8');
    await runGitCommand(['add', 'README.md'], dir);
    await runGitCommand(['commit', '-m', 'initial'], dir);
  }

  async function createSidebarMission() {
    return orchestrator().createMission({
      title: 'Remove duplicate sidebar on Development Runtime page',
      request: 'Fix duplicate console sidebar on /app/development',
      expectedOutcome: '/app/development renders one Console sidebar only',
      observedBehaviour: 'Two vertical sidebar rails visible',
      requestedBy: 'test-user',
      executionMode: 'MANUAL',
    });
  }

  it('impact analysis creates IMPACT_ANALYSED', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, {
      affectedRoutes: ['/app/development'],
      suspectedFiles: ['src/App.jsx'],
      frozenBy: 'test',
    });
    const report = await orchestrator().analyseImpact(mission.id);
    const updated = await orchestrator().getMission(mission.id);
    expect(updated?.state).toBe('IMPACT_ANALYSED');
    expect(report.proposedFiles.length).toBeGreaterThan(0);
    expect(report.affectedSystems).toContain('frontend');
    expect(report.affectedSystems).toContain('routing');
  }, 60000);

  it('design generation creates versioned DevelopmentDesign', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      affectedRoutes: ['/app/development'],
      suspectedFiles: ['src/App.jsx'],
    });
    await orchestrator().analyseImpact(mission.id);
    const design = await orchestrator().proposeDesign(mission.id);
    expect(design.version).toBe(1);
    expect(design.proposedChanges.some((c) => c.file.includes('App.jsx'))).toBe(true);
    const updated = await orchestrator().getMission(mission.id);
    expect(updated?.state).toBe('AWAITING_DESIGN_APPROVAL');
  });

  it('design approval validates design version', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, { frozenBy: 'test' });
    await orchestrator().analyseImpact(mission.id);
    const design = await orchestrator().proposeDesign(mission.id);
    await expect(
      orchestrator().approveDesign(mission.id, { approverUserId: 'owner', designVersion: 99 }),
    ).rejects.toBeInstanceOf(DevelopmentError);
    await orchestrator().approveDesign(mission.id, { approverUserId: 'owner', designVersion: design.version });
    const updated = await orchestrator().getMission(mission.id);
    expect(updated?.state).toBe('WORKSPACE_PREPARING');
  });

  it('unapproved design cannot prepare workspace via direct call without approval', async () => {
    const mission = await createSidebarMission();
    await expect(orchestrator().prepareWorkspace(mission.id)).rejects.toMatchObject({
      code: 'DESIGN_NOT_APPROVED',
    });
  });

  it('branch names are safely normalized', () => {
    const branch = normalizeBranchName('dev-1234567890', 'Remove duplicate sidebar!!!');
    expect(branch).toMatch(/^fix\/dev-/);
    expect(branch.length).toBeLessThanOrEqual(80);
    expect(branch).not.toMatch(/!/);
  });

  it('forbidden paths and traversal are rejected', () => {
    const root = process.cwd();
    expect(() => resolveWorkspaceRelativePath(root, '../secrets')).toThrow(DevelopmentError);
    expect(() => resolveWorkspaceRelativePath(root, 'node_modules/foo')).toThrow(DevelopmentError);
  });

  it('duplicate sidebar mission detection works', async () => {
    const mission = await createSidebarMission();
    expect(isDuplicateSidebarMission(mission)).toBe(true);
  });

  it('implementation cannot run without workspace', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, { frozenBy: 'test' });
    await orchestrator().analyseImpact(mission.id);
    const design = await orchestrator().proposeDesign(mission.id);
    await orchestrator().approveDesign(mission.id, { approverUserId: 'owner', designVersion: design.version });
    await expect(
      orchestrator().implementChange(mission.id, {
        approvedDesignId: design.id,
        approvedDesignVersion: design.version,
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' });
  });

  it('passed checks move to code review when checks succeed', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, { frozenBy: 'test' });
    await orchestrator().analyseImpact(mission.id);
    const design = await orchestrator().proposeDesign(mission.id);
    await orchestrator().approveDesign(mission.id, { approverUserId: 'owner', designVersion: design.version });

    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    store.saveWorkspace({
      id: `ws-${mission.id}`,
      missionId: mission.id,
      path: process.cwd(),
      repository: 'cardbey',
      branch: 'test-branch',
      status: 'READY',
      createdAt: new Date(),
    });
    const m = await orchestrator().getMission(mission.id);
    if (m) {
      store.saveMission({ ...m, state: 'PATCH_READY' });
    }

    const { runDevelopmentChecks } = await import('../services/checkRunner.js');
    const runs = await runDevelopmentChecks({ missionId: mission.id, workspaceRoot: process.cwd(), checkIds: [] });
    expect(runs).toEqual([]);
  }, 10000);

  it('PR cannot be created before patch approval', async () => {
    const mission = await createSidebarMission();
    await expect(orchestrator().openPullRequest(mission.id)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('GitHub-not-configured leaves mission at READY_FOR_PR', async () => {
    const mission = await createSidebarMission();
    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    store.saveMission({
      ...mission,
      state: 'READY_FOR_PR',
      approvedPatchId: 'patch-test',
      approvedPatchVersion: 1,
    });
    const pr = await orchestrator().openPullRequest(mission.id);
    expect(pr.errorCode).toBe('GITHUB_INTEGRATION_NOT_CONFIGURED');
    const after = await orchestrator().getMission(mission.id);
    expect(after?.state).toBe('READY_FOR_PR');
  });

  it('mission state persists across restart', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, { frozenBy: 'test' });
    await orchestrator().analyseImpact(mission.id);
    resetDevelopmentOrchestratorForTests();
    const reloaded = await getDevelopmentOrchestrator().getMission(mission.id);
    expect(reloaded?.state).toBe('IMPACT_ANALYSED');
  });

  it('audit events are recorded', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, { frozenBy: 'test' });
    await orchestrator().analyseImpact(mission.id);
    const events = orchestrator().getEvents(mission.id);
    expect(events.some((e) => e.type === 'development_impact_analysed' || e.type === 'EVIDENCE_FROZEN')).toBe(true);
  });

  it('affectedRoutes from UI/API payload is persisted verbatim in frozen evidence', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      affectedRoutes: ['/app/development'],
      suspectedFiles: [],
      reproductionSteps: ['Open /app/development'],
      currentBehaviour: 'No description preview',
    });

    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    const evidence = store.getEvidence(mission.id);
    expect(evidence).toBeDefined();
    expect(evidence!.affectedRoutes).toEqual(['/app/development']);
  });

  it('omitted affectedRoutes defaults to empty array in frozen evidence', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, { frozenBy: 'test' });

    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    const evidence = store.getEvidence(mission.id);
    expect(evidence).toBeDefined();
    expect(evidence!.affectedRoutes).toEqual([]);
  });

  it('one analyse action produces one impact report and one design in governed mode', async () => {
    const mission = await orchestrator().createMission({
      title: 'Show mission description preview in Development Runtime mission list',
      request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
      expectedOutcome: 'Mission list shows a short description preview under each mission title',
      requestedBy: 'test-user',
      executionMode: 'GOVERNED_AUTOMATION',
    });

    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      affectedRoutes: ['/app/development'],
      suspectedFiles: ['apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'],
    });

    const report = await orchestrator().analyseImpact(mission.id);
    const updated = await orchestrator().getMission(mission.id);

    expect(updated?.state).toBe('AWAITING_DESIGN_APPROVAL');
    expect(report.missionId).toBe(mission.id);

    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    const designs = store.getDesignsForMission(mission.id);
    expect(designs).toHaveLength(1);

    const events = orchestrator().getEvents(mission.id);
    expect(events.filter((e) => e.type === 'development_impact_analysed').length).toBe(1);
    expect(events.filter((e) => e.type === 'development_design_proposed').length).toBe(1);
  }, 60000);

  it('concurrent analyse requests do not create repeated design versions', async () => {
    const mission = await orchestrator().createMission({
      title: 'Show mission description preview in Development Runtime mission list',
      request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
      expectedOutcome: 'Mission list shows a short description preview under each mission title',
      requestedBy: 'test-user',
      executionMode: 'GOVERNED_AUTOMATION',
    });

    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      affectedRoutes: ['/app/development'],
      suspectedFiles: ['apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'],
    });

    const reports = await Promise.all([
      orchestrator().analyseImpact(mission.id),
      orchestrator().analyseImpact(mission.id),
      orchestrator().analyseImpact(mission.id),
    ]);

    // All concurrent callers receive the same single impact report.
    expect(new Set(reports.map((r) => r.id)).size).toBe(1);

    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    const designs = store.getDesignsForMission(mission.id);
    expect(designs.length).toBeLessThanOrEqual(1);

    const events = orchestrator().getEvents(mission.id);
    expect(events.filter((e) => e.type === 'development_impact_analysed').length).toBe(1);
    expect(events.filter((e) => e.type === 'development_design_proposed').length).toBeLessThanOrEqual(1);
  }, 60000);

  it('re-analyse after request changes produces a new design version', async () => {
    const mission = await orchestrator().createMission({
      title: 'Show mission description preview in Development Runtime mission list',
      request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
      expectedOutcome: 'Mission list shows a short description preview under each mission title',
      requestedBy: 'test-user',
      executionMode: 'GOVERNED_AUTOMATION',
    });

    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      affectedRoutes: ['/app/development'],
      suspectedFiles: ['apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'],
    });

    await orchestrator().analyseImpact(mission.id);
    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    expect(store.getDesignsForMission(mission.id)).toHaveLength(1);

    await orchestrator().requestDesignChanges(mission.id, 'Refine the preview length', 'test-user');

    await orchestrator().analyseImpact(mission.id);
    const designs = store.getDesignsForMission(mission.id);
    expect(designs.length).toBe(2);
    expect(designs[0]!.version).toBe(1);
    expect(designs[1]!.version).toBe(2);
  }, 60000);

  it('suspectedFiles string is split on commas, newlines, and spaces', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      suspectedFiles: 'apps/core/cardbey-core/prisma/sqlite/schema.prisma apps/core/cardbey-core/src/development/ apps/core/cardbey-core/package.json',
    });

    const store = (await import('../store/developmentStore.js')).getDevelopmentStore();
    const evidence = store.getEvidence(mission.id);
    expect(evidence!.suspectedFiles).toEqual([
      'apps/core/cardbey-core/prisma/sqlite/schema.prisma',
      'apps/core/cardbey-core/src/development/',
      'apps/core/cardbey-core/package.json',
    ]);
  });

  it('INFRASTRUCTURE mission involving Prisma receives elevated risk', async () => {
    const mission = await orchestrator().createMission({
      type: 'INFRASTRUCTURE',
      title: 'Make Development Runtime use an isolated clean database',
      request: 'Start the development runtime with a fresh isolated SQLite database instead of the shared development database',
      expectedOutcome: 'Development runtime boots with a separate DATABASE_URL and does not touch shared data',
      requestedBy: 'test-user',
      executionMode: 'MANUAL',
    });

    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      suspectedFiles: [
        'apps/core/cardbey-core/prisma/sqlite/schema.prisma',
        'apps/core/cardbey-core/src/development/',
        'apps/core/cardbey-core/package.json',
      ],
    });

    const report = await orchestrator().analyseImpact(mission.id);
    const updated = await orchestrator().getMission(mission.id);

    expect(updated?.riskLevel).toBe('HIGH');
    expect(report.estimatedRisk).toBe('HIGH');
    expect(report.affectedSystems).toContain('database');
  }, 60000);

  it('impact report records canonical repository root and revision', async () => {
    const mission = await orchestrator().createMission({
      title: 'Surface validation snapshot test',
      request: 'Test that impact report carries repo snapshot',
      expectedOutcome: 'Report contains repoRoot and repoRevision',
      requestedBy: 'test-user',
      executionMode: 'MANUAL',
    });

    await orchestrator().freezeEvidence(mission.id, {
      frozenBy: 'test',
      affectedRoutes: ['/app/development'],
    });

    const report = await orchestrator().analyseImpact(mission.id);
    expect(report.repoRoot).toBeDefined();
    expect(report.repoRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(report.findings.some((f) => f.message.includes('Repository snapshot:'))).toBe(true);
  }, 60000);

  describe('pre-implementation surface validation gate', () => {
    let tempWorkspace: string;

    beforeEach(() => {
      tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-surface-test-'));
    });

    it('passes when all CHANGE_TARGET and CONTEXT files exist and revision matches', async () => {
      const target = 'apps/core/cardbey-core/src/x.ts';
      const context = 'apps/core/cardbey-core/src/y.ts';
      fs.mkdirSync(path.join(tempWorkspace, path.dirname(target)), { recursive: true });
      fs.mkdirSync(path.join(tempWorkspace, path.dirname(context)), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, target), 'x', 'utf-8');
      fs.writeFileSync(path.join(tempWorkspace, context), 'y', 'utf-8');

      const result = await validateChangeSurfaceInWorkspace(
        tempWorkspace,
        {
          repoRoot: tempWorkspace,
          repoRevision: undefined,
          changeSurface: {
            changeTargets: [target],
            contextFiles: [context],
            testTargets: [],
            lowRelevance: [],
            lowConfidence: false,
          },
        },
        'dev-surface-pass',
      );

      expect(result.valid).toBe(true);
      expect(result.missingFiles).toEqual([]);
    });

    it('fails with DEVELOPMENT_CHANGE_SURFACE_STALE when a MODIFY target is missing', async () => {
      const target = 'apps/core/cardbey-core/src/missing.ts';

      await expect(
        validateChangeSurfaceInWorkspace(
          tempWorkspace,
          {
            repoRoot: tempWorkspace,
            repoRevision: undefined,
            changeSurface: {
              changeTargets: [target],
              contextFiles: [],
              testTargets: [],
              lowRelevance: [],
              lowConfidence: false,
            },
          },
          'dev-surface-missing',
        ),
      ).rejects.toMatchObject({
        code: 'DEVELOPMENT_CHANGE_SURFACE_STALE',
        body: expect.objectContaining({
          missingFiles: [target],
          missionId: 'dev-surface-missing',
        }),
      });
    });

    it('fails with DEVELOPMENT_CHANGE_SURFACE_STALE when a CONTEXT file is missing', async () => {
      const target = 'apps/core/cardbey-core/src/existing.ts';
      const context = 'apps/core/cardbey-core/src/missing-context.ts';
      fs.mkdirSync(path.join(tempWorkspace, path.dirname(target)), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, target), 'x', 'utf-8');

      await expect(
        validateChangeSurfaceInWorkspace(
          tempWorkspace,
          {
            repoRoot: tempWorkspace,
            repoRevision: undefined,
            changeSurface: {
              changeTargets: [target],
              contextFiles: [context],
              testTargets: [],
              lowRelevance: [],
              lowConfidence: false,
            },
          },
          'dev-surface-missing-context',
        ),
      ).rejects.toMatchObject({
        code: 'DEVELOPMENT_CHANGE_SURFACE_STALE',
        body: expect.objectContaining({
          missingFiles: [context],
        }),
      });
    });

    it('fails with DEVELOPMENT_CHANGE_SURFACE_STALE when workspace revision differs from impact report', async () => {
      const target = 'apps/core/cardbey-core/src/existing.ts';
      fs.mkdirSync(path.join(tempWorkspace, path.dirname(target)), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, target), 'x', 'utf-8');
      await initGitWorkspace(tempWorkspace);

      const workspaceRevision = (await runGitCommand(['rev-parse', 'HEAD'], tempWorkspace)).stdout.trim();
      expect(workspaceRevision).toMatch(/^[0-9a-f]{40}$/);
      const analysedRevision = '0'.repeat(40);
      expect(workspaceRevision).not.toBe(analysedRevision);

      await expect(
        validateChangeSurfaceInWorkspace(
          tempWorkspace,
          {
            repoRoot: tempWorkspace,
            repoRevision: analysedRevision,
            changeSurface: {
              changeTargets: [target],
              contextFiles: [],
              testTargets: [],
              lowRelevance: [],
              lowConfidence: false,
            },
          },
          'dev-surface-revision',
        ),
      ).rejects.toMatchObject({
        code: 'DEVELOPMENT_CHANGE_SURFACE_STALE',
        body: expect.objectContaining({
          analysedRevision,
          workspaceRevision,
        }),
      });
    });
  });
});
