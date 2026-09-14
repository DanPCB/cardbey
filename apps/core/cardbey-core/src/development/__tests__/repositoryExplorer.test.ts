import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LocalRepositoryExplorer } from '../services/reasoning/repository/LocalRepositoryExplorer.js';
import { RepositoryImpactReasoner } from '../services/reasoning/RepositoryImpactReasoner.js';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';

const REPO_ROOT = process.env.CARDBEY_REPO_ROOT || 'C:/Projects/cardbey';
const WORKTREE_ROOT = path.resolve(process.cwd(), '../../..');

function makeMission(overrides: Partial<DevelopmentMission> = {}): DevelopmentMission {
  return {
    id: 'dev-repo-explorer-001',
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
    id: 'ev-repo-explorer-001',
    missionId: 'dev-repo-explorer-001',
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

describe('Repository Explorer + Relevance Ranking V1', () => {
  let tempDir: string;

  beforeAll(() => {
    if (!fs.existsSync(path.join(REPO_ROOT, 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx'))) {
      throw new Error(
        `Repository root ${REPO_ROOT} does not contain expected dashboard source. Set CARDBEY_REPO_ROOT.`,
      );
    }

    const testRoot = path.join(WORKTREE_ROOT, 'apps/core/cardbey-core/src/development/__tests__');
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, '_repo_test_tmp-'));

    // Create synthetic files once so the repository index can be reused.
    const tempRelDir = path.relative(WORKTREE_ROOT, tempDir).replace(/\\/g, '/');
    fs.writeFileSync(
      path.join(tempDir, 'NoisyMissionRepeater.tsx'),
      `export default function NoisyMissionRepeater() {\n${Array.from({ length: 100 })
        .map((_, i) => `  // mission ${i}`)
        .join('\n')}\n}`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'MissionKeywordBomb.test.tsx'),
      `import { describe, it, expect } from 'vitest';\n${Array.from({ length: 100 })
        .map((_, i) => `// mission description preview development runtime list ${i}`)
        .join('\n')}\n`,
      'utf-8',
    );
  }, 60000);

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves route ownership for /app/development to DevelopmentCenterPage', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-route-owner',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-route-owner', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    expect(result.routeOwners['/app/development']).toMatch(/DevelopmentCenterPage\.tsx$/);
    const owner = result.candidates.find((c) => c.path.endsWith('DevelopmentCenterPage.tsx'));
    expect(owner).toBeDefined();
    expect(owner!.score).toBeGreaterThanOrEqual(90);
    expect(owner!.relationship).toBe('ROUTE_OWNER');
  });

  it('imported child components receive relevance evidence', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-imported-child',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-imported-child', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    const child = result.candidates.find((c) => c.path.endsWith('DevelopmentTab.tsx'));
    expect(child).toBeDefined();
    expect(child!.score).toBeGreaterThanOrEqual(55);
    expect(child!.reasons.some((r) => r.includes('Imported directly by route owner'))).toBe(true);
  });

  it('does not surface broad unrelated dashboard files merely because they contain "mission"', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-no-noise',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-no-noise', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    const noisy = [
      'businessCreate.ts',
      'contentLibraryClient.ts',
      'CampaignPromotionDashboardPage.tsx',
      'ControlTowerUIV1.jsx',
      'Roles.tsx',
    ];

    const topPaths = result.candidates.slice(0, 6).map((c) => c.path);
    for (const name of noisy) {
      const candidate = result.candidates.find((c) => c.path.endsWith(name));
      if (candidate) {
        expect(candidate.score).toBeLessThan(30);
      }
      expect(topPaths.some((p) => p.endsWith(name))).toBe(false);
    }
  });

  it('generic keyword-only matches rank below structural matches', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-ranking',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-ranking', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    const top = result.candidates[0]!;
    expect(top.score).toBeGreaterThanOrEqual(80);

    const structural = result.candidates.filter(
      (c) => c.relationship === 'ROUTE_OWNER' || c.relationship === 'IMPORTED_BY_ROUTE_OWNER',
    );
    const genericOnly = result.candidates.filter(
      (c) => c.relationship === 'KEYWORD_MATCH' && c.score < 20,
    );

    expect(structural.length).toBeGreaterThan(0);
    if (genericOnly.length > 0) {
      const minStructural = Math.min(...structural.map((c) => c.score));
      const maxGeneric = Math.max(...genericOnly.map((c) => c.score));
      expect(maxGeneric).toBeLessThan(minStructural);
    }
  });

  it('two unrelated missions generate materially different candidate rankings', async () => {
    const explorer = new LocalRepositoryExplorer();

    const preview = await explorer.explore({
      mission: makeMission({
        id: 'dev-preview-rank',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-preview-rank', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    const exportMission = await explorer.explore({
      mission: makeMission({
        id: 'dev-export-rank',
        title: 'Add export button to performer dashboard',
        request: 'Add CSV export',
        expectedOutcome: 'CSV export works',
      }),
      evidence: makeEvidence({ missionId: 'dev-export-rank', affectedRoutes: ['/app/performer'] }),
      repoRoot: REPO_ROOT,
    });

    const previewTop = preview.candidates.slice(0, 3).map((c) => c.path);
    const exportTop = exportMission.candidates.slice(0, 3).map((c) => c.path);

    expect(previewTop).not.toEqual(exportTop);
    expect(previewTop.some((p) => p.includes('DevelopmentCenterPage') || p.includes('DevelopmentTab'))).toBe(true);
  });

  it('records candidate reasons for every surfaced candidate', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-reasons',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-reasons', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    const top = result.candidates.slice(0, 5);
    expect(top.length).toBeGreaterThan(0);
    for (const c of top) {
      expect(c.reasons.length).toBeGreaterThan(0);
    }
    const owner = top.find((c) => c.path.endsWith('DevelopmentCenterPage.tsx'));
    expect(owner?.reasons.some((r) => r.includes('/app/development'))).toBe(true);
  });

  it('reports low-confidence discovery when evidence is insufficient', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-low-confidence',
        title: 'Zztop xyzzy frobnitz',
        request: 'Qwerty plugh wibble',
        expectedOutcome: 'Nothing happens',
      }),
      evidence: makeEvidence({ missionId: 'dev-low-confidence' }),
      repoRoot: REPO_ROOT,
    });

    expect(result.lowConfidence).toBe(true);
    expect(result.findings.some((f) => f.includes('REPOSITORY_EVIDENCE_LOW_CONFIDENCE'))).toBe(true);

    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-low-confidence-report',
        title: 'Zztop xyzzy frobnitz',
        request: 'Qwerty plugh wibble',
        expectedOutcome: 'Nothing happens',
      }),
      evidence: makeEvidence({ missionId: 'dev-low-confidence-report' }),
      repoRoot: REPO_ROOT,
    });

    expect(report.proposedFiles).toEqual([]);
  });

  it('ImpactReasoner uses explorer candidates and preserves suspected files', async () => {
    const reasoner = new RepositoryImpactReasoner();
    const report = await reasoner.analyse({
      mission: makeMission({
        id: 'dev-integrated',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({
        missionId: 'dev-integrated',
        affectedRoutes: ['/app/development'],
        suspectedFiles: ['apps/core/cardbey-core/src/development/orchestrator/DevelopmentOrchestrator.ts'],
      }),
      repoRoot: REPO_ROOT,
    });

    expect(report.proposedFiles).toContain('apps/core/cardbey-core/src/development/orchestrator/DevelopmentOrchestrator.ts');
    expect(report.proposedFiles.some((p) => p.includes('DevelopmentCenterPage'))).toBe(true);
    expect(report.findings.some((f) => f.message.includes('Route ownership resolved'))).toBe(true);
  });

  it('repeated generic keyword occurrences cannot inflate a candidate score without bound', async () => {
    const repoRoot = fs.mkdtempSync(path.join(tempDir, 'synthetic-repo-'));
    fs.mkdirSync(path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'apps/core/cardbey-core/src'), { recursive: true });

    fs.writeFileSync(
      path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx'),
      `import { Route } from 'react-router-dom';\nimport DevelopmentCenterPage from './pages/development/DevelopmentCenterPage';\nexport default function App() {\n  return <Route path="/app"><Route path="development" element={<DevelopmentCenterPage />} /></Route>;\n}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'),
      'export default function DevelopmentCenterPage() { return <div>Development Runtime</div>; }\n',
      'utf-8',
    );
    const noisyFile = 'apps/core/cardbey-core/src/NoisyMissionRepeater.tsx';
    fs.writeFileSync(
      path.join(repoRoot, noisyFile),
      `export default function NoisyMissionRepeater() {\n${Array.from({ length: 100 })
        .map((_, i) => `  // mission ${i}`)
        .join('\n')}\n}\n`,
      'utf-8',
    );

    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-generic-cap',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-generic-cap', affectedRoutes: ['/app/development'] }),
      repoRoot,
    });

    const noisy = result.candidates.find((c) => c.path === noisyFile);
    expect(noisy).toBeDefined();
    expect(noisy!.score).toBeLessThanOrEqual(40);
    expect(noisy!.relationship).toBe('KEYWORD_MATCH');

    const owner = result.candidates.find((c) => c.path.endsWith('DevelopmentCenterPage.tsx'));
    expect(owner).toBeDefined();
    expect(owner!.relationship).toBe('ROUTE_OWNER');
    expect(owner!.score).toBeGreaterThan(noisy!.score);
  });

  it('test files cannot outrank a strong route owner based only on text frequency', async () => {
    const repoRoot = fs.mkdtempSync(path.join(tempDir, 'synthetic-repo-'));
    fs.mkdirSync(path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'apps/core/cardbey-core/src'), { recursive: true });

    fs.writeFileSync(
      path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx'),
      `import { Route } from 'react-router-dom';\nimport DevelopmentCenterPage from './pages/development/DevelopmentCenterPage';\nexport default function App() {\n  return <Route path="/app"><Route path="development" element={<DevelopmentCenterPage />} /></Route>;\n}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx'),
      'export default function DevelopmentCenterPage() { return <div>Development Runtime</div>; }\n',
      'utf-8',
    );
    const testFile = 'apps/core/cardbey-core/src/MissionKeywordBomb.test.tsx';
    fs.writeFileSync(
      path.join(repoRoot, testFile),
      `import { describe, it, expect } from 'vitest';\n${Array.from({ length: 100 })
        .map((_, i) => `// mission description preview development runtime list ${i}`)
          .join('\n')}\n`,
      'utf-8',
    );

    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-test-rank',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-test-rank', affectedRoutes: ['/app/development'] }),
      repoRoot,
    });

    const owner = result.candidates.find((c) => c.path.endsWith('DevelopmentCenterPage.tsx'));
    expect(owner).toBeDefined();
    expect(owner!.relationship).toBe('ROUTE_OWNER');

    const testCandidate = result.candidates.find((c) => c.path === testFile);
    if (testCandidate) {
      expect(testCandidate.score).toBeLessThan(owner!.score);
      expect(testCandidate.relationship).not.toBe('KEYWORD_MATCH');
    }
  });

  it('route-owner structural evidence dominates keyword-only evidence', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-structural-dom',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Add preview text',
        expectedOutcome: 'Preview shown',
      }),
      evidence: makeEvidence({ missionId: 'dev-structural-dom', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    const structural = result.candidates.filter(
      (c) => c.relationship === 'ROUTE_OWNER' || c.relationship === 'IMPORTED_BY_ROUTE_OWNER',
    );
    const keywordOnly = result.candidates.filter(
      (c) => c.relationship === 'KEYWORD_MATCH' && c.score < 50,
    );

    expect(structural.length).toBeGreaterThan(0);
    const minStructural = Math.min(...structural.map((c) => c.score));
    if (keywordOnly.length > 0) {
      const maxKeyword = Math.max(...keywordOnly.map((c) => c.score));
      expect(maxKeyword).toBeLessThan(minStructural);
    }

    const top = result.candidates[0];
    expect(top).toBeDefined();
    expect(['ROUTE_OWNER', 'IMPORTED_BY_ROUTE_OWNER', 'SUSPECTED_FILE']).toContain(top!.relationship);
  });

  it('Golden Mission does not rank unrelated performer/store/config files above the route ownership chain', async () => {
    const explorer = new LocalRepositoryExplorer();
    const result = await explorer.explore({
      mission: makeMission({
        id: 'dev-golden-no-noise',
        title: 'Show mission description preview in Development Runtime mission list',
        request: 'Show approximately the first 80 characters of a Development Runtime mission description beneath its title in the mission list',
        expectedOutcome: 'Mission list shows a short description preview under each mission title',
      }),
      evidence: makeEvidence({ missionId: 'dev-golden-no-noise', affectedRoutes: ['/app/development'] }),
      repoRoot: REPO_ROOT,
    });

    const unrelated = [
      'performerGrounding/types.test.ts',
      'config/__tests__/index.test.js',
      'pages/public/StorePreviewPage.tsx',
      'services/draftStore/draftStoreService.js',
    ];

    const topPaths = result.candidates.slice(0, 6).map((c) => c.path);
    for (const name of unrelated) {
      expect(topPaths.some((p) => p.endsWith(name))).toBe(false);
    }

    const routeChain = result.candidates.filter(
      (c) =>
        c.path.endsWith('DevelopmentCenterPage.tsx') ||
        c.path.endsWith('DevelopmentTab.tsx') ||
        c.path.endsWith('developmentApi.ts'),
    );
    expect(routeChain.length).toBeGreaterThan(0);
  });
});
