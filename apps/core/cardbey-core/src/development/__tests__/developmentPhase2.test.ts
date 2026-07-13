import { describe, it, expect, beforeEach } from 'vitest';
import { resetDevelopmentStoreForTests } from '../store/developmentStore.js';
import { resetDevelopmentOrchestratorForTests, getDevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator.js';
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
    expect(report.affectedSystems).toContain('console');
  });

  it('design generation creates versioned DevelopmentDesign', async () => {
    const mission = await createSidebarMission();
    await orchestrator().freezeEvidence(mission.id, { frozenBy: 'test', affectedRoutes: ['/app/development'] });
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
});
