import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryChangeSurfaceSelector } from '../services/reasoning/ChangeSurfaceSelector.js';
import { LocalRepositoryExplorer } from '../services/reasoning/repository/LocalRepositoryExplorer.js';
import { RepositoryImpactReasoner } from '../services/reasoning/RepositoryImpactReasoner.js';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';
import type { RepositoryCandidate } from '../services/reasoning/repository/RepositoryExplorer.js';

const REPO_ROOT = process.env.CARDBEY_REPO_ROOT || 'C:/Projects/cardbey';
const WORKTREE_ROOT = path.resolve(process.cwd(), '../../..');

function makeMission(overrides: Partial<DevelopmentMission> = {}): DevelopmentMission {
  return {
    id: 'dev-surface-001',
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
    id: 'ev-surface-001',
    missionId: 'dev-surface-001',
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

describe('Change Surface Selection V1', () => {
  let goldenExploration: Awaited<ReturnType<LocalRepositoryExplorer['explore']>>;
  let exportExploration: Awaited<ReturnType<LocalRepositoryExplorer['explore']>>;
  let tempDir: string;

  beforeAll(async () => {
    if (!fs.existsSync(path.join(REPO_ROOT, 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx'))) {
      throw new Error(`Repository root ${REPO_ROOT} missing dashboard source. Set CARDBEY_REPO_ROOT.`);
    }

    const explorer = new LocalRepositoryExplorer();

    goldenExploration = await explorer.explore({
      mission: makeMission({
        id: 'dev-golden-surface',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-golden-surface', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    exportExploration = await explorer.explore({
      mission: makeMission({
        id: 'dev-export-surface',
        title: 'Add export button to performer dashboard',
        request: 'Add CSV export',
        expectedOutcome: 'CSV export works',
      }),
      evidence: makeEvidence({ missionId: 'dev-export-surface', affectedRoutes: ['/app/performer'] }),
      repoRoot: REPO_ROOT,
    });

    // Create a disposable temp area inside an allowed root for synthetic tests.
    const testRoot = path.join(WORKTREE_ROOT, 'apps/core/cardbey-core/src/development/__tests__');
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, '_surface_test_tmp-'));
  }, 60000);

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('route owner with behavioral evidence is CHANGE_TARGET; structural dependencies are CONTEXT', async () => {
    const selector = new RepositoryChangeSurfaceSelector();
    const selection = await selector.select({
      mission: makeMission({
        id: 'dev-golden-select',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-golden-select', affectedRoutes: ['/app/development'] }),
      candidates: goldenExploration.candidates,
      repoRoot: REPO_ROOT,
    });

    expect(selection.changeTargets).toContain('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx');

    expect(selection.contextFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/lib/development/developmentApi.ts');
    expect(selection.contextFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts');
    expect(selection.contextFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/components/ui/_kit.tsx');
    expect(selection.contextFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentTab.tsx');
  });

  it('generic keyword matches and unrelated filename matches are LOW_RELEVANCE', async () => {
    const selector = new RepositoryChangeSurfaceSelector();
    const selection = await selector.select({
      mission: makeMission({
        id: 'dev-golden-lowrel',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-golden-lowrel', affectedRoutes: ['/app/development'] }),
      candidates: goldenExploration.candidates,
      repoRoot: REPO_ROOT,
    });

    const surfaced = [
      ...selection.changeTargets,
      ...selection.contextFiles,
      ...selection.testTargets,
      ...selection.lowRelevance,
    ];
    for (const name of ['ImageFirstGrid.tsx', 'StorePreviewGrid.tsx', '/types/preview.ts', '/routes/stores.js']) {
      const candidate = surfaced.find((p) => p.includes(name));
      if (candidate) {
        expect(selection.lowRelevance.some((p) => p.includes(name))).toBe(true);
      }
    }
    expect(selection.changeTargets.some((p) => /(ImageFirstGrid|StorePreviewGrid|types\/preview|routes\/stores)/.test(p))).toBe(false);
  });

  it('suspected file is always CHANGE_TARGET', async () => {
    const selector = new RepositoryChangeSurfaceSelector();
    const candidate: RepositoryCandidate = {
      path: 'apps/core/cardbey-core/src/ignored/File.tsx',
      score: 100,
      reasons: ['Explicitly suspected in evidence'],
      matchedTerms: [],
      relationship: 'SUSPECTED_FILE',
    };

    const selection = await selector.select({
      mission: makeMission({ id: 'dev-suspected', title: 'Do something', request: 'Fix it' }),
      evidence: makeEvidence({ missionId: 'dev-suspected' }),
      candidates: [candidate],
      repoRoot: REPO_ROOT,
    });

    expect(selection.changeTargets).toContain(candidate.path);
    expect(selection.lowConfidence).toBe(false);
  });

  it('imported child with filename matching distinctive term becomes CHANGE_TARGET', async () => {
    const selector = new RepositoryChangeSurfaceSelector();
    const tempRelDir = path.relative(WORKTREE_ROOT, tempDir).replace(/\\/g, '/');
    const candidate: RepositoryCandidate = {
      path: `${tempRelDir}/ShowPreviewPanel.tsx`,
      score: 60,
      reasons: ['Imported by route owner'],
      matchedTerms: ['preview'],
      relationship: 'IMPORTED_BY_ROUTE_OWNER',
    };

    fs.writeFileSync(
      path.join(WORKTREE_ROOT, candidate.path),
      'export default function ShowPreviewPanel() { return <div>preview</div>; }',
      'utf-8',
    );

    const selection = await selector.select({
      mission: makeMission({
        id: 'dev-imported-target',
        title: 'Show preview panel',
        request: 'Show preview panel',
        expectedOutcome: 'Preview panel shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-imported-target' }),
      candidates: [candidate],
      repoRoot: WORKTREE_ROOT,
    });

    expect(selection.changeTargets).toContain(candidate.path);
  });

  it('discovers a regression test for a CHANGE_TARGET', async () => {
    const selector = new RepositoryChangeSurfaceSelector();
    const tempRelDir = path.relative(WORKTREE_ROOT, tempDir).replace(/\\/g, '/');
    const baseName = `MissionListPage_${Date.now()}`;
    const sourceFile = `${tempRelDir}/${baseName}.tsx`;
    const testFile = `${tempRelDir}/${baseName}.test.tsx`;

    fs.writeFileSync(
      path.join(WORKTREE_ROOT, sourceFile),
      'export default function MissionListPage() { return <ul><li>widget</li></ul>; }',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(WORKTREE_ROOT, testFile),
      "import { describe, it, expect } from 'vitest'; describe('x', () => { it('y', () => expect(true).toBe(true)); });",
      'utf-8',
    );

    const candidate: RepositoryCandidate = {
      path: sourceFile,
      score: 90,
      reasons: ['Route /app/widgets renders component in this file'],
      matchedTerms: ['widget'],
      relationship: 'ROUTE_OWNER',
    };

    const selection = await selector.select({
      mission: makeMission({
        id: 'dev-test-target',
        title: 'Render widget list',
        request: 'Show widget list',
        expectedOutcome: 'Widget list renders',
      }),
      evidence: makeEvidence({ missionId: 'dev-test-target', affectedRoutes: ['/app/widgets'] }),
      candidates: [candidate],
      repoRoot: WORKTREE_ROOT,
    });

    expect(selection.changeTargets).toContain(sourceFile);
    expect(selection.testTargets).toContain(testFile);
  });

  it('two unrelated missions produce different change surfaces', async () => {
    const selector = new RepositoryChangeSurfaceSelector();

    const golden = await selector.select({
      mission: makeMission({
        id: 'dev-golden-diff',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-golden-diff', affectedRoutes: ['/app/development'] }),
      candidates: goldenExploration.candidates,
      repoRoot: REPO_ROOT,
    });

    const exporter = await selector.select({
      mission: makeMission({
        id: 'dev-export-diff',
        title: 'Add export button to performer dashboard',
        request: 'Add CSV export',
        expectedOutcome: 'CSV export works',
      }),
      evidence: makeEvidence({ missionId: 'dev-export-diff', affectedRoutes: ['/app/performer'] }),
      candidates: exportExploration.candidates,
      repoRoot: REPO_ROOT,
    });

    expect(golden.changeTargets).not.toEqual(exporter.changeTargets);
    expect(golden.changeTargets.some((p) => p.includes('DevelopmentCenterPage'))).toBe(true);
  });

  it('reports low confidence when no change target can be justified', async () => {
    const selector = new RepositoryChangeSurfaceSelector();
    const selection = await selector.select({
      mission: makeMission({
        id: 'dev-lowconf',
        title: 'Zztop xyzzy frobnitz',
        request: 'Qwerty plugh wibble',
        expectedOutcome: 'Nothing happens',
      }),
      evidence: makeEvidence({ missionId: 'dev-lowconf' }),
      candidates: [],
      repoRoot: REPO_ROOT,
    });

    expect(selection.changeTargets).toEqual([]);
    expect(selection.lowConfidence).toBe(true);
    expect(selection.findings.some((f) => f.includes('CHANGE_SURFACE_LOW_CONFIDENCE'))).toBe(true);
  });

  it('RepositoryImpactReasoner produces a small, justified proposedFiles set', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-impact-small',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-impact-small', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    expect(report.proposedFiles).toContain('apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx');
    expect(report.proposedFiles.some((p) => p.includes('ImageFirstGrid'))).toBe(false);
    expect(report.proposedFiles.some((p) => p.includes('lib/api.ts'))).toBe(false);
    expect(report.proposedFiles.length).toBeLessThanOrEqual(3);
  });

  it('directory suspected file is treated as discovery scope, not change target', async () => {
    const selector = new RepositoryChangeSurfaceSelector();
    const candidates: RepositoryCandidate[] = [
      {
        path: 'apps/core/cardbey-core/src/development/',
        score: 100,
        reasons: ['Explicitly suspected in evidence'],
        matchedTerms: [],
        relationship: 'SUSPECTED_FILE',
      },
      {
        path: 'apps/core/cardbey-core/src/development/orchestrator/DevelopmentOrchestrator.ts',
        score: 90,
        reasons: ['Route /app/development renders component in this file'],
        matchedTerms: ['development'],
        relationship: 'ROUTE_OWNER',
      },
    ];

    const selection = await selector.select({
      mission: makeMission({
        id: 'dev-dir-scope',
        title: 'Make Development Runtime use an isolated clean database',
        request: 'Use isolated database',
        expectedOutcome: 'Database isolated',
      }),
      evidence: makeEvidence({ missionId: 'dev-dir-scope' }),
      candidates,
      repoRoot: REPO_ROOT,
    });

    expect(selection.changeTargets).not.toContain('apps/core/cardbey-core/src/development/');
    expect(selection.contextFiles).toContain('apps/core/cardbey-core/src/development/');
  });

  it('database/Prisma infrastructure mission receives elevated risk and review flags', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-db-risk',
        type: 'INFRASTRUCTURE',
        title: 'Make Development Runtime use an isolated clean database',
        request: 'Start the development runtime with a fresh isolated SQLite database instead of the shared development database',
        expectedOutcome: 'Database isolated',
      }),
      evidence: makeEvidence({
        missionId: 'dev-db-risk',
        suspectedFiles: [
          'apps/core/cardbey-core/prisma/sqlite/schema.prisma',
          'apps/core/cardbey-core/src/development/',
          'apps/core/cardbey-core/package.json',
        ],
      }),
      repoRoot: REPO_ROOT,
    });

    expect(report.estimatedRisk).toBe('HIGH');
    expect(report.affectedSystems).toContain('database');
  });
});
