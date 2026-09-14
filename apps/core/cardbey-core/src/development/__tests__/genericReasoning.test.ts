import { describe, it, expect, beforeEach } from 'vitest';
import { resetDevelopmentStoreForTests } from '../store/developmentStore.js';
import { resetDevelopmentOrchestratorForTests, getDevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator.js';
import { RepositoryImpactReasoner } from '../services/reasoning/RepositoryImpactReasoner.js';
import { RepositoryDesignPlanner } from '../services/reasoning/DesignPlanner.js';
import { cardbeyRepositoryManifest } from '../repositories/cardbeyRepositoryManifest.js';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';

function makeMission(overrides: Partial<DevelopmentMission> = {}): DevelopmentMission {
  return {
    id: 'dev-generic-001',
    type: 'FEATURE',
    repositoryId: 'cardbey',
    baseBranch: 'main',
    title: overrides.title ?? 'Generic mission',
    request: overrides.request ?? 'Generic request',
    expectedOutcome: overrides.expectedOutcome ?? 'Generic outcome',
    observedBehaviour: overrides.observedBehaviour,
    riskLevel: 'LOW',
    state: 'ANALYSING',
    requestedBy: 'test-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<DevelopmentEvidence> = {}): DevelopmentEvidence {
  return {
    id: 'ev-generic-001',
    missionId: 'dev-generic-001',
    logs: [],
    screenshots: [],
    requestIds: [],
    affectedRoutes: overrides.affectedRoutes,
    suspectedFiles: overrides.suspectedFiles,
    reproductionSteps: [],
    expectedBehaviour: 'expected',
    currentBehaviour: 'current',
    environment: {
      appVersions: {},
      commitHash: 'unknown',
      databaseProvider: 'unknown',
      nodeVersion: process.version,
    },
    frozenAt: new Date(),
    frozenBy: 'test',
    ...overrides,
  };
}

describe('Generic Development Runtime reasoning', () => {
  beforeEach(() => {
    resetDevelopmentStoreForTests();
    resetDevelopmentOrchestratorForTests();
  });

  it('mission-description-preview mission does NOT produce ConsoleShell/PageShell/duplicate-sidebar recommendations', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const mission = makeMission({
      id: 'dev-preview-001',
      title: 'Show mission description preview in Development Runtime mission list',
      request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
      expectedOutcome: 'Mission list shows a short description preview under each mission title',
    });
    const evidence = makeEvidence({
      missionId: mission.id,
      affectedRoutes: ['/app/development'],
    });

    const report = await reasoner.analyse({
      mission,
      evidence,
      repoRoot: cardbeyRepositoryManifest.repoRoot,
    });

    const text = JSON.stringify(report).toLowerCase();
    expect(text).not.toContain('consoleshell');
    expect(text).not.toContain('pageshell');
    expect(text).not.toContain('duplicate sidebar');
    expect(text).not.toContain('console route');
    expect(text).not.toContain('developmentcenterpage content-only');
  });

  it('different generic frontend missions produce different impact findings', async () => {
    const reasoner = new RepositoryImpactReasoner();

    const missionA = makeMission({
      id: 'dev-a',
      title: 'Show mission description preview in Development Runtime mission list',
      request: 'Add preview text',
      expectedOutcome: 'Preview shown',
    });
    const missionB = makeMission({
      id: 'dev-b',
      title: 'Add export button to performer dashboard',
      request: 'Add CSV export',
      expectedOutcome: 'CSV export works',
    });

    const reportA = await reasoner.analyse({
      mission: missionA,
      evidence: makeEvidence({ missionId: missionA.id, affectedRoutes: ['/app/development'] }),
      repoRoot: cardbeyRepositoryManifest.repoRoot,
    });
    const reportB = await reasoner.analyse({
      mission: missionB,
      evidence: makeEvidence({ missionId: missionB.id, affectedRoutes: ['/app/performer'] }),
      repoRoot: cardbeyRepositoryManifest.repoRoot,
    });

    expect(reportA.acceptanceCriteria).not.toEqual(reportB.acceptanceCriteria);
    expect(reportA.canonicalPath).toBe('/app/development');
    expect(reportB.canonicalPath).toBe('/app/performer');
  });

  it('impact report reflects repository evidence when suspected files are provided', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const mission = makeMission({
      id: 'dev-evidence-001',
      title: 'Update mission list rendering',
      request: 'Change how missions render',
      expectedOutcome: 'Missions render correctly',
    });
    const evidence = makeEvidence({
      missionId: mission.id,
      suspectedFiles: ['apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'],
      affectedRoutes: ['/app/development'],
    });

    const report = await reasoner.analyse({
      mission,
      evidence,
      repoRoot: cardbeyRepositoryManifest.repoRoot,
    });

    expect(report.proposedFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx');
    expect(report.affectedSystems).toContain('frontend');
  });

  it('design consumes the generated impact report', async () => {
    const planner = new RepositoryDesignPlanner();
    const mission = makeMission({
      id: 'dev-design-001',
      title: 'Update mission list rendering',
      request: 'Change how missions render',
      expectedOutcome: 'Missions render correctly',
    });
    const impactReport = {
      id: 'imp-dev-design-001',
      missionId: mission.id,
      affectedSystems: ['frontend', 'routing'],
      observedSystems: ['frontend', 'routing'],
      modifiedSystems: ['frontend'],
      canonicalPath: '/app/development',
      legacyPaths: [],
      proposedFiles: ['apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'],
      migrationRequired: false,
      securityReviewRequired: false,
      performanceReviewRequired: false,
      estimatedRisk: 'LOW' as const,
      estimatedEffort: 'SMALL' as const,
      acceptanceCriteria: ['Missions render correctly'],
      findings: [{ severity: 'INFO' as const, message: 'Found page component', location: 'DevelopmentCenterPage.tsx' }],
      recommendations: ['Inspect page component'],
      generatedAt: new Date(),
      generatedBy: 'test',
    };

    const design = await planner.generateDesign({
      mission,
      evidence: makeEvidence({ missionId: mission.id }),
      impactReport,
      proposedBy: 'test',
      version: 1,
    });

    expect(design.proposedChanges).toHaveLength(1);
    expect(design.proposedChanges[0]!.file).toBe('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx');
    expect(design.diagnosis).toContain('Found page component');
  });

  it('orchestrator produces a generic design for a non-sidebar mission', async () => {
    const orchestrator = getDevelopmentOrchestrator();
    const mission = await orchestrator.createMission({
      type: 'FEATURE',
      title: 'Show mission description preview in Development Runtime mission list',
      request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
      expectedOutcome: 'Mission list shows a short description preview under each mission title',
      requestedBy: 'test-user',
      executionMode: 'MANUAL',
    });

    await orchestrator.freezeEvidence(mission.id, {
      frozenBy: 'test',
      affectedRoutes: ['/app/development'],
      suspectedFiles: ['apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'],
    });

    await orchestrator.analyseImpact(mission.id);
    const design = await orchestrator.proposeDesign(mission.id);

    const text = JSON.stringify(design).toLowerCase();
    expect(text).not.toContain('consoleshell');
    expect(text).not.toContain('pageshell');
    expect(text).not.toContain('duplicate sidebar');
    expect(design.proposedChanges.length).toBeGreaterThan(0);
  });
});
