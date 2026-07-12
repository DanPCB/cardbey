/**
 * Apply verified implementation for development missions (workspace-scoped).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';
import type { DevelopmentPatch } from '../types/DevelopmentPatch.js';
import type { DevelopmentFileChange } from '../types/DevelopmentFileChange.js';
import { readWorkspaceFile, writeWorkspaceFile } from './pathSecurity.js';
import { isDuplicateSidebarMission } from './designPlanner.js';
import { searchRepository } from './repositoryTools.js';
import { cardbeyRepositoryManifest } from '../repositories/cardbeyRepositoryManifest.js';

const APP_REL = 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx';
const TEST_REL = 'apps/dashboard/cardbey-marketing-dashboard/src/components/development/developmentConsoleRouting.test.tsx';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function countLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

function buildUnifiedDiff(pathRel: string, before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const chunks: string[] = [`--- a/${pathRel}`, `+++ b/${pathRel}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i += 1) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) continue;
    if (b !== undefined) chunks.push(`-${b}`);
    if (a !== undefined) chunks.push(`+${a}`);
  }
  return chunks.join('\n');
}

async function applyDuplicateSidebarFix(workspaceRoot: string): Promise<{
  diagnosis: string;
  fileChanges: Array<{ path: string; before: string; after: string; changeType: 'MODIFY' | 'CREATE' }>;
}> {
  const diagnosisParts: string[] = [];
  const fileChanges: Array<{ path: string; before: string; after: string; changeType: 'MODIFY' | 'CREATE' }> = [];

  const shellSearch = await searchRepository(workspaceRoot, 'ConsoleSidebar');
  const appSearch = await searchRepository(workspaceRoot, 'isConsole');
  diagnosisParts.push(`ConsoleSidebar references: ${shellSearch.matches.length}`);
  diagnosisParts.push(`isConsole references: ${appSearch.matches.length}`);

  let appBefore = '';
  try {
    appBefore = await readWorkspaceFile(workspaceRoot, APP_REL);
  } catch {
    appBefore = '';
  }

  let appAfter = appBefore;
  let rootCause = 'Root cause B: /app/development not classified as console route';

  if (!appBefore.includes('/app/development')) {
    appAfter = appBefore.replace(
      /loc\.pathname\.startsWith\("\/app\/console"\)/,
      'loc.pathname.startsWith("/app/console") ||\n    loc.pathname.startsWith("/app/development")',
    );
    if (appAfter === appBefore) {
      appAfter = appBefore.replace(
        'loc.pathname.startsWith("/app/console")',
        'loc.pathname.startsWith("/app/console") ||\n    loc.pathname.startsWith("/app/development")',
      );
    }
    if (appAfter === appBefore) {
      appAfter = appBefore.replace(
        /loc\.pathname\.startsWith\("\/app\/missions"\)/,
        'loc.pathname.startsWith("/app/missions") ||\n    loc.pathname.startsWith("/app/development")',
      );
    }
  }

  if (!appAfter.includes('DevelopmentCenterPage')) {
    const importLine = "import DevelopmentCenterPage from './pages/development/DevelopmentCenterPage.jsx';";
    if (!appAfter.includes(importLine)) {
      appAfter = appAfter.replace(
        /(import ConsoleShell[^\n]+\n)/,
        `$1${importLine}\n`,
      );
    }
    if (!appAfter.includes('path="development"')) {
      appAfter = appAfter.replace(
        /<Route path="console\/control-tower"[^/]*\/>/,
        (m) => `${m}\n        <Route path="development" element={<DevelopmentCenterPage />} />`,
      );
    }
  }

  if (appAfter !== appBefore) {
    fileChanges.push({ path: APP_REL, before: appBefore, after: appAfter, changeType: 'MODIFY' });
  }

  const guestFn = 'function isGuestAllowedConsolePath';
  if (appAfter.includes(guestFn) && !appAfter.includes("path.startsWith('/app/development')")) {
    const guestBefore = appAfter;
    let guestAfter = guestBefore.replace(
      /path\.startsWith\('\/app\/console'\)/,
      "path.startsWith('/app/console') ||\n    path.startsWith('/app/development')",
    );
    if (guestAfter === guestBefore) {
      guestAfter = guestBefore.replace(
        "path.startsWith('/app/console')",
        "path.startsWith('/app/console') ||\n    path.startsWith('/app/development')",
      );
    }
    if (guestAfter !== guestBefore) {
      const idx = fileChanges.findIndex((f) => f.path === APP_REL);
      if (idx >= 0) fileChanges[idx] = { ...fileChanges[idx]!, after: guestAfter };
      else fileChanges.push({ path: APP_REL, before: guestBefore, after: guestAfter, changeType: 'MODIFY' });
      appAfter = guestAfter;
    }
  }

  const devPageRel = 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx';
  try {
    const pageContent = await readWorkspaceFile(workspaceRoot, devPageRel);
    if (/ConsoleShell|ConsoleSidebar|<Sidebar/.test(pageContent)) {
      rootCause = 'Root cause A: Development page mounts nested shell/sidebar';
      diagnosisParts.push('DevelopmentCenterPage imports shell/sidebar — must be content-only');
    }
  } catch {
    /* page may not exist in workspace */
  }

  let testBefore = '';
  try {
    testBefore = await readWorkspaceFile(workspaceRoot, TEST_REL);
  } catch {
    testBefore = '';
  }

  const canonicalTest = `import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appPath = path.resolve(__dirname, '../../App.jsx');

describe('development console routing', () => {
  it('classifies /app/development as console layout', () => {
    const source = fs.readFileSync(appPath, 'utf-8');
    expect(source).toMatch(/app\\/development/);
    expect(source).toContain('DevelopmentCenterPage');
    expect(source).toContain('ConsoleShell');
    expect(source).not.toMatch(/display:\\\\s*none.*sidebar/i);
  });

  it('DevelopmentCenterPage is content-only without nested shell', () => {
    const pagePath = path.resolve(__dirname, '../../pages/development/DevelopmentCenterPage.tsx');
    const pageSource = fs.readFileSync(pagePath, 'utf-8');
    expect(pageSource).not.toMatch(/ConsoleShell|ConsoleSidebar|<Sidebar/);
    expect(pageSource).toContain('DevelopmentTab');
  });
});
`;

  if (!testBefore.includes('readFileSync')) {
    fileChanges.push({
      path: TEST_REL,
      before: testBefore,
      after: canonicalTest,
      changeType: testBefore ? 'MODIFY' : 'CREATE',
    });
  }

  return {
    diagnosis: `${rootCause}. ${diagnosisParts.join('; ')}`,
    fileChanges,
  };
}

export async function implementDevelopmentChange(input: {
  mission: DevelopmentMission;
  design: DevelopmentDesign;
  workspaceRoot: string;
  workspaceId: string;
  author: string;
}): Promise<{ patch: DevelopmentPatch; fileChanges: DevelopmentFileChange[]; diff: string }> {
  const { mission, design, workspaceRoot, workspaceId, author } = input;

  let result: Awaited<ReturnType<typeof applyDuplicateSidebarFix>>;
  if (isDuplicateSidebarMission(mission)) {
    result = await applyDuplicateSidebarFix(workspaceRoot);
  } else {
    result = { diagnosis: design.diagnosis, fileChanges: [] };
  }

  const unifiedDiffs: string[] = [];
  const devFileChanges: DevelopmentFileChange[] = [];

  for (const change of result.fileChanges) {
    if (change.changeType === 'CREATE') {
      await writeWorkspaceFile(workspaceRoot, change.path, change.after);
    } else {
      await writeWorkspaceFile(workspaceRoot, change.path, change.after);
    }
    const diff = buildUnifiedDiff(change.path, change.before, change.after);
    unifiedDiffs.push(diff);
    const { additions, deletions } = countLines(diff);
    devFileChanges.push({
      id: `fc-${mission.id}-${devFileChanges.length}`,
      patchId: `patch-${mission.id}`,
      path: change.path,
      changeType: change.changeType,
      additions,
      deletions,
      beforeHash: change.before ? hashContent(change.before) : undefined,
      afterHash: hashContent(change.after),
    });
  }

  const diff = unifiedDiffs.join('\n\n');
  const diffDir = path.join(cardbeyRepositoryManifest.workspaceRoot, 'diffs');
  await fs.promises.mkdir(diffDir, { recursive: true });
  const diffArtifactPath = path.join(diffDir, `${mission.id}.diff`);
  await fs.promises.writeFile(diffArtifactPath, diff, 'utf-8');

  const patch: DevelopmentPatch = {
    id: `patch-${mission.id}`,
    missionId: mission.id,
    summary: design.summary,
    description: result.diagnosis,
    filesAdded: devFileChanges.filter((f) => f.changeType === 'CREATE').map((f) => f.path),
    filesModified: devFileChanges.filter((f) => f.changeType === 'MODIFY').map((f) => f.path),
    filesDeleted: [],
    linesAdded: devFileChanges.reduce((s, f) => s + f.additions, 0),
    linesDeleted: devFileChanges.reduce((s, f) => s + f.deletions, 0),
    diff,
    author,
    createdAt: new Date(),
    approved: false,
  };

  (patch as DevelopmentPatch & { workspaceId?: string; version?: number; riskLevel?: string; diffArtifactPath?: string }).workspaceId = workspaceId;
  (patch as DevelopmentPatch & { version?: number }).version = 1;
  (patch as DevelopmentPatch & { riskLevel?: string }).riskLevel = mission.riskLevel;
  (patch as DevelopmentPatch & { diffArtifactPath?: string }).diffArtifactPath = diffArtifactPath;

  return { patch, fileChanges: devFileChanges, diff };
}
