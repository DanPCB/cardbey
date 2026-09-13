import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { implementDevelopmentChange } from '../services/implementationService.js';
import { resolveCodingProvider } from '../services/coding/resolveCodingProvider.js';
import { duplicateSidebarCodingProvider } from '../services/coding/DuplicateSidebarCodingProvider.js';
import { DevelopmentError } from '../errors.js';
import {
  resolveWorkspaceRelativePath,
  isElevatedPath,
} from '../services/pathSecurity.js';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';
import type { CodingProviderContext } from '../services/coding/CodingProvider.js';

function makeMission(overrides: Partial<DevelopmentMission> = {}): DevelopmentMission {
  return {
    id: 'dev-test-001',
    type: 'BUG_FIX',
    repositoryId: 'cardbey',
    baseBranch: 'main',
    title: overrides.title ?? 'Test mission',
    request: overrides.request ?? 'Test request',
    expectedOutcome: 'Test outcome',
    observedBehaviour: overrides.observedBehaviour,
    riskLevel: 'LOW',
    state: 'IMPLEMENTING',
    requestedBy: 'test-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDesign(overrides: Partial<DevelopmentDesign> = {}): DevelopmentDesign {
  return {
    id: 'design-dev-test-001-v1',
    missionId: 'dev-test-001',
    version: 1,
    summary: overrides.summary ?? 'Test design',
    diagnosis: overrides.diagnosis ?? 'Test diagnosis',
    proposedChanges: overrides.proposedChanges ?? [],
    testPlan: [],
    rollbackPlan: 'Revert branch',
    risks: [],
    proposedBy: 'test-user',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-coding-test-'));
  // Create allowed-root subdirectories so tests can write bounded files.
  fs.mkdirSync(path.join(dir, 'apps/core/cardbey-core/src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps/core/cardbey-core/src/auth'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps/dashboard/cardbey-marketing-dashboard/src'), { recursive: true });
  return dir;
}

describe('CodingProvider foundation', () => {
  let workspaceRoot: string;
  let originalKimiFlag: string | undefined;

  beforeEach(() => {
    workspaceRoot = createTempWorkspace();
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

  it('resolver selects DuplicateSidebarCodingProvider for duplicate-sidebar missions', () => {
    const mission = makeMission({
      title: 'Remove duplicate sidebar on Development Runtime page',
      request: 'Fix duplicate console sidebar on /app/development',
      observedBehaviour: 'Two vertical sidebar rails visible',
    });
    const design = makeDesign();
    const provider = resolveCodingProvider({ mission, design });
    expect(provider.id).toBe('duplicate-sidebar');
  });

  it('resolver throws UNSUPPORTED_CODING_PROVIDER for unsupported missions', () => {
    const mission = makeMission({
      title: 'Refactor unrelated utility',
      request: 'Clean up helper functions',
    });
    const design = makeDesign();

    let err: unknown;
    try {
      resolveCodingProvider({ mission, design });
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(DevelopmentError);
    expect((err as DevelopmentError).code).toBe('UNSUPPORTED_CODING_PROVIDER');
  });

  it('DuplicateSidebarCodingProvider preserves legacy behavior when App.jsx exists', async () => {
    const appRel = 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx';
    const appPath = path.join(workspaceRoot, appRel);
    fs.writeFileSync(
      appPath,
      `import ControlTowerPage from './pages/ControlTowerPage.jsx';\n\nfunction isConsole(loc) {\n  return loc.pathname.startsWith("/app/console");\n}\n`,
      'utf-8',
    );

    const mission = makeMission({
      title: 'Remove duplicate sidebar on Development Runtime page',
      request: 'Fix duplicate console sidebar on /app/development',
      observedBehaviour: 'Two vertical sidebar rails visible',
    });
    const design = makeDesign();

    const provider = resolveCodingProvider({ mission, design });
    const context: CodingProviderContext = {
      mission,
      design,
      workspaceRoot,
      workspaceId: 'ws-test-001',
      author: 'test',
    };

    const result = await provider.implement(context);

    expect(result.fileChanges.some((f) => f.path === appRel)).toBe(true);
    const appChange = result.fileChanges.find((f) => f.path === appRel);
    expect(appChange!.after).toContain('/app/development');
  });

  it('implementDevelopmentChange produces DevelopmentPatch, DevelopmentFileChange, and diff for duplicate-sidebar', async () => {
    const appRel = 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx';
    const appPath = path.join(workspaceRoot, appRel);
    fs.writeFileSync(
      appPath,
      `import ControlTowerPage from './pages/ControlTowerPage.jsx';\n\nfunction isConsole(loc) {\n  return loc.pathname.startsWith("/app/console");\n}\n`,
      'utf-8',
    );

    const mission = makeMission({
      id: 'dev-sidebar-002',
      title: 'Remove duplicate sidebar on Development Runtime page',
      request: 'Fix duplicate console sidebar on /app/development',
      observedBehaviour: 'Two vertical sidebar rails visible',
    });
    const design = makeDesign({ summary: 'Remove duplicate sidebar', missionId: mission.id });

    const { patch, fileChanges, diff, elevatedPaths } = await implementDevelopmentChange({
      mission,
      design,
      workspaceRoot,
      workspaceId: 'ws-test-002',
      author: 'test',
    });

    expect(patch.missionId).toBe(mission.id);
    expect(patch.filesModified).toContain(appRel);
    expect(fileChanges.length).toBeGreaterThan(0);
    expect(diff).toContain('--- a/');
    expect(elevatedPaths).toEqual([]);

    // Verify Cardbey's bounded writer actually persisted the change.
    const written = fs.readFileSync(appPath, 'utf-8');
    expect(written).toContain('/app/development');
  });

  it('path security rejects traversal outside the mission workspace', () => {
    expect(() => resolveWorkspaceRelativePath(workspaceRoot, '../secrets')).toThrow(DevelopmentError);
    expect(() => resolveWorkspaceRelativePath(workspaceRoot, 'apps/../../etc/passwd')).toThrow(
      DevelopmentError,
    );
  });

  it('path security rejects forbidden paths', () => {
    expect(() => resolveWorkspaceRelativePath(workspaceRoot, '.env')).toThrow(DevelopmentError);
    expect(() => resolveWorkspaceRelativePath(workspaceRoot, 'node_modules/foo')).toThrow(
      DevelopmentError,
    );
  });

  it('path security rejects paths outside allowed roots', () => {
    expect(() => resolveWorkspaceRelativePath(workspaceRoot, 'random-file.txt')).toThrow(
      DevelopmentError,
    );
    expect(() => resolveWorkspaceRelativePath(workspaceRoot, 'apps/other/file.ts')).toThrow(
      DevelopmentError,
    );
  });

  it('allowed worktree file modification produces a real DevelopmentFileChange', async () => {
    const { fileChanges, diff } = await implementDevelopmentChange({
      mission: makeMission({
        id: 'dev-sidebar-003',
        title: 'Remove duplicate sidebar on Development Runtime page',
        request: 'Fix duplicate console sidebar on /app/development',
        observedBehaviour: 'Two vertical sidebar rails visible',
      }),
      design: makeDesign({ summary: 'Remove duplicate sidebar', missionId: 'dev-sidebar-003' }),
      workspaceRoot,
      workspaceId: 'ws-test-003',
      author: 'test',
    });

    // The duplicate-sidebar provider may mutate App.jsx, create a regression
    // test, or both depending on the current workspace contents. We verify the
    // returned bookkeeping represents a real, bounded change without forcing a
    // specific file to mutate.
    expect(fileChanges.length).toBeGreaterThan(0);
    const change = fileChanges[0]!;
    expect(change.path).toMatch(/^(apps\/dashboard|apps\/core|packages)\//);
    expect(change.additions + change.deletions).toBeGreaterThan(0);
    expect(change.afterHash).toBeDefined();
    expect(diff).toContain('--- a/');
  });

  it('isElevatedPath exposes auth/prisma/workflow paths for later approval logic', () => {
    expect(isElevatedPath('apps/core/cardbey-core/src/auth/guard.ts')).toBe(true);
    expect(isElevatedPath('apps/core/cardbey-core/prisma/schema.prisma')).toBe(true);
    expect(isElevatedPath('.github/workflows/deploy.yml')).toBe(true);
    expect(isElevatedPath('apps/core/cardbey-core/src/lib/helper.ts')).toBe(false);
    expect(isElevatedPath('apps/dashboard/cardbey-marketing-dashboard/src/App.jsx')).toBe(false);
  });
});
