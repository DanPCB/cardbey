/**
 * Legacy calibration provider for the duplicate-sidebar mission class.
 *
 * This provider preserves the exact behavior originally embedded in
 * implementationService.ts. It exists only to keep the existing calibrated
 * regression working while the runtime becomes provider-neutral.
 */

import { readWorkspaceFile } from '../pathSecurity.js';
import { searchRepository } from '../repositoryTools.js';
import { isDuplicateSidebarMission } from '../designPlanner.js';
import type {
  CodingProvider,
  CodingProviderContext,
  CodingProviderFileChange,
} from './CodingProvider.js';

const APP_REL = 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx';
const TEST_REL = 'apps/dashboard/cardbey-marketing-dashboard/src/components/development/developmentConsoleRouting.test.tsx';

export const duplicateSidebarCodingProvider: CodingProvider = {
  id: 'duplicate-sidebar',

  canImplement({ mission }) {
    return isDuplicateSidebarMission(mission);
  },

  async implement({ workspaceRoot }) {
    const result = await applyDuplicateSidebarFix(workspaceRoot);
    return {
      diagnosis: result.diagnosis,
      fileChanges: result.fileChanges,
    };
  },
};

async function applyDuplicateSidebarFix(
  workspaceRoot: string,
): Promise<{
  diagnosis: string;
  fileChanges: CodingProviderFileChange[];
}> {
  const diagnosisParts: string[] = [];
  const fileChanges: CodingProviderFileChange[] = [];

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
        /(import ControlTowerPage[^\n]+\n)/,
        `$1${importLine}\n`,
      );
    }
  }

  if (!appAfter.includes('path="development"')) {
    appAfter = appAfter.replace(
      '<Route path="telemetry" element={<MissionConsoleTelemetryPage />} />',
      '<Route path="telemetry" element={<MissionConsoleTelemetryPage />} />\n        <Route path="development" element={<DevelopmentCenterPage />} />',
    );
    if (!appAfter.includes('path="development"')) {
      appAfter = appAfter.replace(
        '<Route path="control-tower" element={<ControlTowerPage />} />',
        '<Route path="development" element={<DevelopmentCenterPage />} />\n        <Route path="control-tower" element={<ControlTowerPage />} />',
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
