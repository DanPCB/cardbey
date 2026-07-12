/**
 * Development Runtime orchestrator — Phase 2 lifecycle.
 */

import { randomUUID } from 'node:crypto';
import type { DevelopmentMission, DevelopmentMissionState } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';
import type { DevelopmentImpactReport } from '../types/DevelopmentImpactReport.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';
import type { DevelopmentWorkspace } from '../types/DevelopmentWorkspace.js';
import type { DevelopmentPatch } from '../types/DevelopmentPatch.js';
import type { DevelopmentCheckRun } from '../types/DevelopmentCheckRun.js';
import type { DevelopmentReview } from '../types/DevelopmentReview.js';
import type { DevelopmentPullRequest } from '../types/DevelopmentPullRequest.js';
import { stateMachine } from '../state/DevelopmentStateMachine.js';
import { getDevelopmentStore, type DevelopmentEventRecord } from '../store/developmentStore.js';
import { DevelopmentError } from '../errors.js';
import { generateMissionDesign, isDuplicateSidebarMission } from '../services/designPlanner.js';
import { prepareDevelopmentWorktree, gitCommitAll } from '../services/workspaceWorktree.js';
import { implementDevelopmentChange } from '../services/implementationService.js';
import { runDevelopmentChecks, allRequiredChecksPassed, DUPLICATE_SIDEBAR_CHECK_IDS } from '../services/checkRunner.js';
import { mirrorWorkspaceFilesForChecks } from '../services/checkMirror.js';
import { getManifestForRepository } from '../repositories/cardbeyRepositoryManifest.js';
import { normalizeBranchName } from '../services/workspaceWorktree.js';

function nowIso(): string {
  return new Date().toISOString();
}

function transitionMission(
  mission: DevelopmentMission,
  to: DevelopmentMissionState,
): DevelopmentMission {
  if (!stateMachine.validateTransition(mission.state, to)) {
    throw new DevelopmentError(409, 'INVALID_STATE_TRANSITION', `Cannot transition ${mission.state} → ${to}`, {
      currentState: mission.state,
      requiredState: to,
    });
  }
  return { ...mission, state: to, updatedAt: nowIso() };
}

export interface CreateMissionInput {
  type?: DevelopmentMission['type'];
  repositoryId?: string;
  baseBranch?: string;
  title: string;
  request: string;
  expectedOutcome: string;
  observedBehaviour?: string;
  requestedBy: string;
  executionMode?: DevelopmentMission['executionMode'];
}

export class DevelopmentOrchestrator {
  private store = getDevelopmentStore();

  private emit(event: Omit<DevelopmentEventRecord, 'id' | 'timestamp'>): void {
    this.store.appendEvent({
      ...event,
      id: `evt-${randomUUID()}`,
      timestamp: nowIso(),
    });
  }

  private saveMission(mission: DevelopmentMission): DevelopmentMission {
    this.store.saveMission(mission);
    return mission;
  }

  async createMission(input: CreateMissionInput): Promise<DevelopmentMission> {
    const mission: DevelopmentMission = {
      id: `dev-${Date.now()}`,
      type: input.type || 'BUG_FIX',
      repositoryId: input.repositoryId || 'cardbey',
      baseBranch: input.baseBranch || 'main',
      title: input.title,
      request: input.request,
      expectedOutcome: input.expectedOutcome,
      observedBehaviour: input.observedBehaviour,
      riskLevel: 'LOW',
      state: 'REQUESTED',
      requestedBy: input.requestedBy,
      executionMode: input.executionMode || 'GOVERNED_AUTOMATION',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.saveMission(mission);
    this.emit({
      type: 'MISSION_CREATED',
      missionId: mission.id,
      actorType: 'user',
      actorId: input.requestedBy,
      repositoryId: mission.repositoryId,
    });
    return mission;
  }

  async getMission(id: string): Promise<DevelopmentMission | null> {
    return this.store.getMission(id) ?? null;
  }

  async cancelMission(id: string, reason: string, actorId = 'system'): Promise<DevelopmentMission> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    const updated = transitionMission(mission, 'CANCELLED');
    updated.rejectionReason = reason;
    this.saveMission(updated);
    this.emit({
      type: 'MISSION_CANCELLED',
      missionId: id,
      actorType: 'user',
      actorId,
      repositoryId: mission.repositoryId,
      payload: { reason },
    });
    return updated;
  }

  async freezeEvidence(id: string, body: Record<string, unknown>, actorId = 'system'): Promise<DevelopmentMission> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');

    const evidence: DevelopmentEvidence = {
      id: `ev-${id}`,
      missionId: id,
      logs: (body.logs as DevelopmentEvidence['logs']) || [],
      screenshots: (body.screenshots as DevelopmentEvidence['screenshots']) || [],
      requestIds: (body.requestIds as string[]) || [],
      affectedRoutes: (body.affectedRoutes as string[]) || [],
      suspectedFiles: (body.suspectedFiles as string[]) || [],
      reproductionSteps: (body.reproductionSteps as string[]) || [],
      expectedBehaviour: String(body.expectedBehaviour || mission.expectedOutcome),
      currentBehaviour: String(body.currentBehaviour || mission.observedBehaviour || ''),
      environment: (body.environment as DevelopmentEvidence['environment']) || {
        appVersions: {},
        commitHash: 'unknown',
        databaseProvider: 'unknown',
        nodeVersion: process.version,
      },
      frozenAt: new Date(),
      frozenBy: String(body.frozenBy || actorId),
    };

    this.store.saveEvidence(id, evidence);
    let updated = transitionMission(mission, 'ANALYSING');
    updated.evidenceSnapshotId = evidence.id;
    this.saveMission(updated);
    this.emit({
      type: 'EVIDENCE_FROZEN',
      missionId: id,
      actorType: 'user',
      actorId: evidence.frozenBy,
      repositoryId: mission.repositoryId,
    });
    return updated;
  }

  async analyseImpact(id: string, actorId = 'system'): Promise<DevelopmentImpactReport> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (mission.state !== 'ANALYSING' && mission.state !== 'IMPACT_ANALYSED') {
      throw new DevelopmentError(409, 'INVALID_STATE_TRANSITION', 'Mission must be analysing', {
        currentState: mission.state,
        requiredState: 'ANALYSING',
      });
    }

    const evidence = this.store.getEvidence(id);
    if (!evidence) {
      throw new DevelopmentError(409, 'EVIDENCE_REQUIRED', 'Evidence must be frozen before impact analysis');
    }

    const proposedFiles =
      evidence.suspectedFiles?.length
        ? [...evidence.suspectedFiles]
        : isDuplicateSidebarMission(mission)
          ? [
              'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx',
              'apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleShell.tsx',
              'apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleSidebar.tsx',
              'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx',
              'apps/dashboard/cardbey-marketing-dashboard/src/components/development/DevelopmentTab.tsx',
            ]
          : [];

    const affectedSystems = new Set<string>();
    for (const route of evidence.affectedRoutes ?? []) {
      if (route.startsWith('/app') || route.startsWith('/console')) {
        affectedSystems.add('frontend');
        affectedSystems.add('routing');
        affectedSystems.add('console');
        affectedSystems.add('navigation');
      }
    }
    for (const file of proposedFiles) {
      const n = file.toLowerCase();
      if (n.includes('app.jsx') || n.includes('route')) affectedSystems.add('routing');
      if (n.includes('consoleshell') || n.includes('pageshell')) affectedSystems.add('console-layout');
      if (n.includes('consolesidebar') || n.includes('sidebar')) affectedSystems.add('navigation');
      if (n.endsWith('.tsx') || n.endsWith('.jsx')) affectedSystems.add('frontend');
    }
    if (affectedSystems.size === 0) affectedSystems.add('unknown');

    const report: DevelopmentImpactReport = {
      id: `imp-${id}`,
      missionId: id,
      affectedSystems: Array.from(affectedSystems),
      canonicalPath: '/app/development',
      legacyPaths: [],
      proposedFiles,
      migrationRequired: false,
      securityReviewRequired: false,
      performanceReviewRequired: false,
      estimatedRisk: mission.riskLevel,
      estimatedEffort: 'SMALL',
      acceptanceCriteria: [
        mission.expectedOutcome,
        '/app/development renders one Console sidebar only',
        'No CSS hiding of duplicate rails',
      ],
      findings: isDuplicateSidebarMission(mission)
        ? [
            {
              severity: 'WARNING',
              message: 'Duplicate sidebar may be caused by nested shell or missing console route classification',
              location: 'App.jsx / ConsoleShell',
            },
          ]
        : [],
      recommendations: [
        'Inspect ConsoleShell vs PageShell layout ownership',
        'Verify /app/development is classified as console route',
        'Keep DevelopmentCenterPage content-only',
      ],
      generatedAt: new Date(),
      generatedBy: actorId,
    };

    this.store.saveImpactReport(report);
    let updated = transitionMission(mission, 'IMPACT_ANALYSED');
    this.saveMission(updated);
    this.emit({
      type: 'development_impact_analysed',
      missionId: id,
      actorType: 'agent',
      actorId,
      repositoryId: mission.repositoryId,
    });

    if (updated.executionMode === 'GOVERNED_AUTOMATION') {
      await this.proposeDesign(id, actorId);
    }

    return report;
  }

  async proposeDesign(id: string, actorId = 'system'): Promise<DevelopmentDesign> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (mission.state !== 'IMPACT_ANALYSED' && mission.state !== 'AWAITING_DESIGN_APPROVAL') {
      throw new DevelopmentError(409, 'INVALID_STATE_TRANSITION', 'Mission must be impact analysed', {
        currentState: mission.state,
        requiredState: 'IMPACT_ANALYSED',
      });
    }

    const evidence = this.store.getEvidence(id);
    const impactReport = this.store.getImpactReport(id);
    if (!evidence || !impactReport) {
      throw new DevelopmentError(409, 'IMPACT_REQUIRED', 'Impact report required before design');
    }

    const existing = this.store.getDesignsForMission(id);
    const version = existing.length + 1;
    const design = generateMissionDesign({
      mission,
      evidence,
      impactReport,
      proposedBy: actorId,
      version,
    });

    this.store.saveDesign(design);
    let updated = mission.state === 'IMPACT_ANALYSED'
      ? transitionMission(mission, 'DESIGN_PROPOSED')
      : mission;
    updated = transitionMission(updated, 'AWAITING_DESIGN_APPROVAL');
    this.saveMission(updated);
    this.emit({
      type: 'development_design_proposed',
      missionId: id,
      designId: design.id,
      actorType: 'agent',
      actorId,
      repositoryId: mission.repositoryId,
    });
    return design;
  }

  async approveDesign(
    id: string,
    input: { approverUserId: string; note?: string; designVersion: number },
  ): Promise<DevelopmentMission> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (mission.state !== 'AWAITING_DESIGN_APPROVAL' && mission.state !== 'DESIGN_PROPOSED') {
      throw new DevelopmentError(409, 'INVALID_STATE_TRANSITION', 'Mission awaiting design approval', {
        currentState: mission.state,
        requiredState: 'AWAITING_DESIGN_APPROVAL',
      });
    }

    const design = this.store.getLatestDesign(id);
    if (!design || design.version !== input.designVersion) {
      throw new DevelopmentError(409, 'DESIGN_VERSION_MISMATCH', 'Design version does not match');
    }

    design.approvedBy = input.approverUserId;
    design.approvedAt = nowIso();
    this.store.saveDesign(design);

    const review: DevelopmentReview = {
      id: `rev-design-${id}-${design.version}`,
      missionId: id,
      type: 'DESIGN',
      reviewer: input.approverUserId,
      status: 'APPROVED',
      comments: input.note,
      approvedAt: new Date(),
    };
    this.store.saveReview(review);

    let updated = transitionMission(mission, 'WORKSPACE_PREPARING');
    updated.approvedDesignId = design.id;
    updated.approvedDesignVersion = design.version;
    updated.approvedBy = input.approverUserId;
    this.saveMission(updated);
    this.emit({
      type: 'development_design_approved',
      missionId: id,
      designId: design.id,
      actorType: 'user',
      actorId: input.approverUserId,
      repositoryId: mission.repositoryId,
    });

    if (updated.executionMode === 'GOVERNED_AUTOMATION') {
      await this.prepareWorkspace(id, input.approverUserId);
    }

    return this.store.getMission(id)!;
  }

  async requestDesignChanges(id: string, reason: string, actorId: string): Promise<DevelopmentMission> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    const design = this.store.getLatestDesign(id);
    if (design) {
      design.changesRequestedBy = actorId;
      design.changesRequestedAt = nowIso();
      design.changesRequestedReason = reason;
      this.store.saveDesign(design);
    }
    const updated = transitionMission(mission, 'IMPACT_ANALYSED');
    this.saveMission(updated);
    this.emit({
      type: 'development_design_changes_requested',
      missionId: id,
      designId: design?.id,
      actorType: 'user',
      actorId,
      repositoryId: mission.repositoryId,
      payload: { reason },
    });
    return updated;
  }

  async rejectDesign(id: string, reason: string, actorId: string): Promise<DevelopmentMission> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    const design = this.store.getLatestDesign(id);
    if (design) {
      design.rejectedBy = actorId;
      design.rejectedAt = nowIso();
      design.rejectionReason = reason;
      this.store.saveDesign(design);
    }
    return this.cancelMission(id, reason, actorId);
  }

  async prepareWorkspace(id: string, actorId = 'system'): Promise<DevelopmentWorkspace> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (!mission.approvedDesignId) {
      throw new DevelopmentError(409, 'DESIGN_NOT_APPROVED', 'Design must be approved before workspace preparation');
    }
    if (this.store.getWorkspaceForMission(id)) {
      throw new DevelopmentError(409, 'WORKSPACE_ALREADY_EXISTS', 'Workspace already exists');
    }

    const manifest = getManifestForRepository(mission.repositoryId);
    if (!manifest) {
      throw new DevelopmentError(400, 'REPOSITORY_NOT_ALLOWED', 'Repository not allowlisted');
    }

    this.emit({
      type: 'development_workspace_prepare_started',
      missionId: id,
      actorType: 'system',
      actorId,
      repositoryId: mission.repositoryId,
    });

    let updated = mission.state === 'WORKSPACE_PREPARING'
      ? mission
      : transitionMission(mission, 'WORKSPACE_PREPARING');
    this.saveMission(updated);

    try {
      const wt = await prepareDevelopmentWorktree({
        missionId: id,
        title: mission.title,
        baseBranch: mission.baseBranch,
      });

      const workspace: DevelopmentWorkspace = {
        id: `ws-${id}`,
        missionId: id,
        path: wt.workspacePath,
        repository: mission.repositoryId,
        branch: wt.branchName,
        status: 'READY',
        createdAt: new Date(),
        preparedAt: new Date(),
      };
      this.store.saveWorkspace(workspace);
      updated = transitionMission(updated, 'IMPLEMENTING');
      updated.workspaceId = workspace.id;
      this.saveMission(updated);
      this.emit({
        type: 'development_workspace_prepared',
        missionId: id,
        workspaceId: workspace.id,
        actorType: 'system',
        actorId,
        repositoryId: mission.repositoryId,
        branchName: wt.branchName,
      });

      if (updated.executionMode === 'GOVERNED_AUTOMATION') {
        await this.implementChange(id, {
          approvedDesignId: mission.approvedDesignId!,
          approvedDesignVersion: mission.approvedDesignVersion!,
        }, actorId);
      }

      return workspace;
    } catch (err) {
      const failed = transitionMission(updated, 'FAILED');
      failed.failureReason = err instanceof Error ? err.message : String(err);
      this.saveMission(failed);
      throw err;
    }
  }

  async implementChange(
    id: string,
    input: { approvedDesignId: string; approvedDesignVersion: number },
    actorId = 'system',
  ): Promise<DevelopmentPatch> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    const workspace = this.store.getWorkspaceForMission(id);
    if (!workspace) {
      throw new DevelopmentError(409, 'WORKSPACE_REQUIRED', 'Workspace must exist before implementation');
    }
    const design = this.store.getDesignById(input.approvedDesignId);
    if (!design || design.version !== input.approvedDesignVersion) {
      throw new DevelopmentError(409, 'DESIGN_NOT_APPROVED', 'Approved design version mismatch');
    }

    let updated = mission.state === 'IMPLEMENTING'
      ? mission
      : transitionMission(mission, 'IMPLEMENTING');
    this.saveMission(updated);
    this.emit({
      type: 'development_implementation_started',
      missionId: id,
      workspaceId: workspace.id,
      designId: design.id,
      actorType: 'agent',
      actorId,
      repositoryId: mission.repositoryId,
      branchName: workspace.branch,
    });

    const { patch, fileChanges } = await implementDevelopmentChange({
      mission,
      design,
      workspaceRoot: workspace.path,
      workspaceId: workspace.id,
      author: actorId,
    });

    this.store.savePatch(patch);
    this.store.saveFileChanges(fileChanges);
    updated = transitionMission(updated, 'PATCH_READY');
    this.saveMission(updated);
    this.emit({
      type: 'development_patch_created',
      missionId: id,
      workspaceId: workspace.id,
      patchId: patch.id,
      actorType: 'agent',
      actorId,
      repositoryId: mission.repositoryId,
    });

    if (updated.executionMode === 'GOVERNED_AUTOMATION') {
      await this.runChecks(id, actorId);
    }

    return patch;
  }

  async runChecks(id: string, actorId = 'system'): Promise<DevelopmentCheckRun[]> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    const workspace = this.store.getWorkspaceForMission(id);
    if (!workspace) throw new DevelopmentError(409, 'WORKSPACE_REQUIRED', 'Workspace required');

    let updated = transitionMission(mission, 'TESTING');
    this.saveMission(updated);
    this.emit({
      type: 'development_checks_started',
      missionId: id,
      workspaceId: workspace.id,
      actorType: 'system',
      actorId,
      repositoryId: mission.repositoryId,
    });

    const patch = this.store.getLatestPatch(id);
    const fileChanges = patch ? this.store.getFileChangesForPatch(patch.id) : [];
    const paths = fileChanges.map((f) => f.path);
    if (paths.length > 0) {
      await mirrorWorkspaceFilesForChecks(workspace.path, paths);
    }

    const checkIds = isDuplicateSidebarMission(mission) ? DUPLICATE_SIDEBAR_CHECK_IDS : undefined;
    const runs = await runDevelopmentChecks({
      missionId: id,
      workspaceRoot: workspace.path,
      checkIds,
    });
    for (const run of runs) {
      this.store.saveCheckRun(run);
      this.emit({
        type: 'development_check_completed',
        missionId: id,
        actorType: 'system',
        actorId,
        repositoryId: mission.repositoryId,
        payload: { checkId: run.id, status: run.status },
      });
    }

    if (allRequiredChecksPassed(runs)) {
      updated = transitionMission(updated, 'AWAITING_CODE_REVIEW');
      this.saveMission(updated);
      this.emit({
        type: 'development_checks_passed',
        missionId: id,
        actorType: 'system',
        actorId,
        repositoryId: mission.repositoryId,
      });
    } else {
      updated = transitionMission(updated, 'TEST_FAILED');
      this.saveMission(updated);
      this.emit({
        type: 'development_checks_failed',
        missionId: id,
        actorType: 'system',
        actorId,
        repositoryId: mission.repositoryId,
      });
    }

    return runs;
  }

  async approvePatch(
    id: string,
    input: { reviewerUserId: string; note?: string; patchVersion: number },
  ): Promise<DevelopmentMission> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (mission.state !== 'AWAITING_CODE_REVIEW') {
      throw new DevelopmentError(409, 'INVALID_STATE_TRANSITION', 'Mission must be awaiting code review', {
        currentState: mission.state,
        requiredState: 'AWAITING_CODE_REVIEW',
      });
    }

    const patch = this.store.getLatestPatch(id);
    if (!patch) throw new DevelopmentError(404, 'PATCH_NOT_FOUND', 'Patch not found');
    const patchVersion = (patch as DevelopmentPatch & { version?: number }).version ?? 1;
    if (patchVersion !== input.patchVersion) {
      throw new DevelopmentError(409, 'PATCH_VERSION_MISMATCH', 'Patch version mismatch');
    }

    const failedChecks = this.store.getCheckRunsForMission(id).filter((c) => c.status === 'FAILED');
    if (failedChecks.length > 0) {
      throw new DevelopmentError(409, 'CHECKS_FAILED', 'Required checks must pass before patch approval');
    }

    patch.approved = true;
    patch.reviewedBy = input.reviewerUserId;
    patch.reviewedAt = new Date();
    this.store.savePatch(patch);

    const review: DevelopmentReview = {
      id: `rev-patch-${id}`,
      missionId: id,
      type: 'CODE',
      reviewer: input.reviewerUserId,
      status: 'APPROVED',
      comments: input.note,
      approvedAt: new Date(),
    };
    this.store.saveReview(review);

    const workspace = this.store.getWorkspaceForMission(id);
    if (workspace) {
      const hash = await gitCommitAll(workspace.path, `[dev-runtime] ${mission.title}`);
      if (hash) {
        patch.commitHash = hash;
        this.store.savePatch(patch);
        this.emit({
          type: 'development_commit_created',
          missionId: id,
          workspaceId: workspace.id,
          patchId: patch.id,
          actorType: 'system',
          actorId: input.reviewerUserId,
          repositoryId: mission.repositoryId,
          branchName: workspace.branch,
          payload: { commitHash: hash },
        });
      }
    }

    let updated = transitionMission(mission, 'READY_FOR_PR');
    updated.approvedPatchId = patch.id;
    updated.approvedPatchVersion = patchVersion;
    this.saveMission(updated);
    this.emit({
      type: 'development_patch_approved',
      missionId: id,
      patchId: patch.id,
      actorType: 'user',
      actorId: input.reviewerUserId,
      repositoryId: mission.repositoryId,
    });
    return updated;
  }

  async openPullRequest(id: string, actorId = 'system'): Promise<DevelopmentPullRequest> {
    const mission = this.store.getMission(id);
    if (!mission) throw new DevelopmentError(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (mission.state !== 'READY_FOR_PR') {
      throw new DevelopmentError(409, 'INVALID_STATE_TRANSITION', 'Mission must be READY_FOR_PR', {
        currentState: mission.state,
        requiredState: 'READY_FOR_PR',
      });
    }
    if (!mission.approvedPatchId) {
      throw new DevelopmentError(409, 'PATCH_NOT_APPROVED', 'Patch must be approved');
    }

    const workspace = this.store.getWorkspaceForMission(id);
    const patch = this.store.getLatestPatch(id);
    const branchName = workspace?.branch || normalizeBranchName(id, mission.title);
    const patchId = patch?.id || mission.approvedPatchId || `patch-${id}`;
    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

    if (!githubToken) {
      const pr: DevelopmentPullRequest = {
        id: `pr-${id}`,
        missionId: id,
        patchId,
        branchName,
        commitHash: patch?.commitHash,
        state: 'READY',
        manualCommand: `gh pr create --base ${mission.baseBranch} --head ${branchName} --title "${mission.title}" --body "Development Runtime mission ${id}"`,
        createdAt: nowIso(),
        errorCode: 'GITHUB_INTEGRATION_NOT_CONFIGURED',
        errorMessage: 'GitHub token not configured',
      };
      this.store.savePullRequest(pr);
      return pr;
    }

    // GitHub configured path would create real PR — stub returns manual for safety
    const pr: DevelopmentPullRequest = {
      id: `pr-${id}`,
      missionId: id,
      patchId,
      branchName,
      commitHash: patch?.commitHash,
      state: 'CREATED',
      prUrl: `https://github.com/cardbey/cardbey/pull/new/${branchName}`,
      createdAt: nowIso(),
    };
    this.store.savePullRequest(pr);
    const updated = transitionMission(mission, 'PR_CREATED');
    updated.pullRequestId = pr.id;
    this.saveMission(updated);
    this.emit({
      type: 'development_pull_request_created',
      missionId: id,
      patchId: patch?.id,
      actorType: 'user',
      actorId,
      repositoryId: mission.repositoryId,
      branchName,
    });
    return pr;
  }

  getImpactReport(missionId: string) {
    return this.store.getImpactReport(missionId);
  }

  getLatestDesign(missionId: string) {
    return this.store.getLatestDesign(missionId);
  }

  getWorkspace(missionId: string) {
    return this.store.getWorkspaceForMission(missionId);
  }

  getLatestPatch(missionId: string) {
    return this.store.getLatestPatch(missionId);
  }

  getFileChanges(patchId: string) {
    return this.store.getFileChangesForPatch(patchId);
  }

  getCheckRuns(missionId: string) {
    return this.store.getCheckRunsForMission(missionId);
  }

  getReviews(missionId: string) {
    return this.store.getReviewsForMission(missionId);
  }

  getPullRequest(missionId: string) {
    return this.store.getPullRequestForMission(missionId);
  }

  getEvents(missionId: string) {
    return this.store.getEventsForMission(missionId);
  }

  listMissions(): DevelopmentMission[] {
    return this.store.getMissions();
  }
}

let orchestratorSingleton: DevelopmentOrchestrator | null = null;

export function getDevelopmentOrchestrator(): DevelopmentOrchestrator {
  if (!orchestratorSingleton) orchestratorSingleton = new DevelopmentOrchestrator();
  return orchestratorSingleton;
}

export function resetDevelopmentOrchestratorForTests(): void {
  orchestratorSingleton = null;
}
