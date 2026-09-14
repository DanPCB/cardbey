import { describe, it, expect } from 'vitest';
import { RepositoryImpactReasoner } from '../services/reasoning/RepositoryImpactReasoner.js';
import { cardbeyRepositoryManifest } from '../repositories/cardbeyRepositoryManifest.js';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';

const REPO_ROOT = cardbeyRepositoryManifest.repoRoot;

function makeMission(overrides: Partial<DevelopmentMission> = {}): DevelopmentMission {
  return {
    id: 'dev-surface-v2-001',
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
    id: 'ev-surface-v2-001',
    missionId: 'dev-surface-v2-001',
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

describe('Change Surface Reasoning V2', () => {
  it('A. frontend-only UI mission keeps unrelated imported service as CONTEXT', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-filter-ui',
        title: 'Add mission type filter to Development Runtime mission list',
        request: 'In /app/development, add a small filter above the mission list that lets the user show All missions or filter by mission type.',
        expectedOutcome: 'The filter uses existing DevelopmentMission type values and must not change mission data, backend contracts, routing, shell layout, or mission state behaviour.',
      }),
      evidence: makeEvidence({
        missionId: 'dev-filter-ui',
        affectedRoutes: ['/app/development'],
      }),
      repoRoot: REPO_ROOT,
    });

    expect(report.proposedFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx');
    expect(report.proposedFiles.some((p) => p.includes('/services/user.ts'))).toBe(false);
    expect(report.proposedFiles.some((p) => p.includes('/lib/development/developmentApi.ts'))).toBe(false);
    expect(report.proposedFiles.length).toBeLessThanOrEqual(2);
  }, 60000);

  it('B. route owner discovery does not imply routing modification', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-route-observed',
        title: 'Add mission type filter to Development Runtime mission list',
        request: 'In /app/development, add a small filter above the mission list that lets the user show All missions or filter by mission type.',
        expectedOutcome: 'The filter uses existing DevelopmentMission type values and must not change routing.',
      }),
      evidence: makeEvidence({
        missionId: 'dev-route-observed',
        affectedRoutes: ['/app/development'],
      }),
      repoRoot: REPO_ROOT,
    });

    expect(report.observedSystems).toContain('routing');
    expect(report.observedSystems).toContain('frontend');
    expect(report.modifiedSystems).not.toContain('routing');
    expect(report.modifiedSystems).toContain('frontend');
  }, 60000);

  it('C. "must not change backend contracts/routing" does not create positive keyword evidence', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-constraint-suppress',
        title: 'Add mission type filter to Development Runtime mission list',
        request: 'In /app/development, add a filter. Must not change backend contracts or routing.',
        expectedOutcome: 'Filter works without backend changes.',
      }),
      evidence: makeEvidence({
        missionId: 'dev-constraint-suppress',
        affectedRoutes: ['/app/development'],
      }),
      repoRoot: REPO_ROOT,
    });

    expect(report.proposedFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx');
    expect(report.proposedFiles.some((p) => p.includes('/services/user.ts'))).toBe(false);
    expect(report.modifiedSystems).not.toContain('backend');
    expect(report.modifiedSystems).not.toContain('routing');
  }, 60000);

  it('D. genuine backend mission still selects backend target', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-backend-genuine',
        type: 'BUG_FIX',
        title: 'Fix current user store hydration bug',
        request: 'When /api/auth/me returns a guest session, services/user.ts incorrectly hydrates stores from a legacy field. Update the hydration logic.',
        expectedOutcome: 'Guest sessions do not trigger store hydration in services/user.ts.',
      }),
      evidence: makeEvidence({
        missionId: 'dev-backend-genuine',
        suspectedFiles: ['apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts'],
      }),
      repoRoot: REPO_ROOT,
    });

    expect(report.proposedFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts');
    expect(report.modifiedSystems).toContain('backend');
  }, 60000);

  it('E. genuine cross-stack mission can select frontend + backend targets', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-cross-stack',
        type: 'FEATURE',
        title: 'Expose user store status in Development Runtime header',
        request: 'In /app/development, show the current user store status badge. This requires reading a new hasStore flag from /api/auth/me and rendering it in the header.',
        expectedOutcome: 'Header shows store status from backend.',
      }),
      evidence: makeEvidence({
        missionId: 'dev-cross-stack',
        affectedRoutes: ['/app/development'],
        suspectedFiles: [
          'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx',
          'apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts',
        ],
      }),
      repoRoot: REPO_ROOT,
    });

    expect(report.proposedFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx');
    expect(report.proposedFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts');
    expect(report.modifiedSystems).toContain('frontend');
    expect(report.modifiedSystems).toContain('backend');
  }, 60000);
});
