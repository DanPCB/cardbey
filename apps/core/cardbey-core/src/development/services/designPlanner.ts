/**
 * Mission-specific design generation from impact report and evidence.
 */

import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';
import type { DevelopmentImpactReport } from '../types/DevelopmentImpactReport.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';

const SIDEBAR_MISSION_HINTS = ['duplicate sidebar', 'sidebar', 'console rail', 'two vertical'];

export function isDuplicateSidebarMission(mission: DevelopmentMission): boolean {
  const text = `${mission.title} ${mission.request} ${mission.observedBehaviour ?? ''}`.toLowerCase();
  return SIDEBAR_MISSION_HINTS.some((h) => text.includes(h));
}

export function generateMissionDesign(input: {
  mission: DevelopmentMission;
  evidence: DevelopmentEvidence;
  impactReport: DevelopmentImpactReport;
  proposedBy: string;
  version: number;
}): DevelopmentDesign {
  const { mission, evidence, impactReport, proposedBy, version } = input;
  const files = impactReport.proposedFiles.length > 0
    ? impactReport.proposedFiles
    : evidence.suspectedFiles ?? [];

  const dashboardFiles = files.map((f) =>
    f.startsWith('apps/') ? f : `apps/dashboard/cardbey-marketing-dashboard/${f.replace(/^src\//, 'src/')}`,
  );

  if (isDuplicateSidebarMission(mission)) {
    return {
      id: `design-${mission.id}-v${version}`,
      missionId: mission.id,
      version,
      summary: 'Remove duplicate console sidebar on Development Runtime routes',
      diagnosis: `The duplicated rail may come from either:
1. a second shell mounted inside the Development page, or
2. the outer AppShell/PageShell wrapping /app/development while ConsoleShell also renders its own rail.

Repository inspection is required before implementation. Hypothesis only — root cause must be verified in workspace.`,
      proposedChanges: [
        {
          file: 'apps/dashboard/cardbey-marketing-dashboard/src/App.jsx',
          purpose: 'Classify /app/development as console layout; add nested route under ConsoleShell',
          changeType: 'MODIFY',
        },
        {
          file: 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx',
          purpose: 'Keep page content-only — no nested ConsoleShell or Sidebar',
          changeType: 'MODIFY',
        },
        {
          file: 'apps/dashboard/cardbey-marketing-dashboard/src/components/development/DevelopmentTab.tsx',
          purpose: 'State-specific review cards; no layout shell imports',
          changeType: 'MODIFY',
        },
        ...dashboardFiles
          .filter((f) => !f.endsWith('App.jsx') && !f.includes('DevelopmentCenterPage') && !f.includes('DevelopmentTab'))
          .map((file) => ({
            file,
            purpose: 'Inspect layout ownership and sidebar rendering',
            changeType: 'MODIFY' as const,
          })),
        {
          file: 'apps/dashboard/cardbey-marketing-dashboard/src/components/development/developmentConsoleRouting.test.tsx',
          purpose: 'Regression: single canonical console sidebar owner for /app/development',
          changeType: 'CREATE',
        },
      ],
      testPlan: [
        'Regression test: /app/development uses console layout without nested sidebar',
        'Verify /app, /app/missions, /app/development each render one ConsoleSidebar',
        'dashboard vitest targeted test passes',
        'dashboard vite build (no minify) passes',
      ],
      rollbackPlan: 'Revert branch; remove /app/development console classification if regression detected',
      risks: [
        'Console route classification may affect guest auth paths',
        'Must not fix with CSS hiding — structural layout only',
      ],
      proposedBy,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: `design-${mission.id}-v${version}`,
    missionId: mission.id,
    version,
    summary: `Design for: ${mission.title}`,
    diagnosis: impactReport.findings?.map((f) => f.message).join('\n') || mission.request,
    proposedChanges: dashboardFiles.map((file) => ({
      file,
      purpose: 'Implement smallest valid change per impact analysis',
      changeType: 'MODIFY' as const,
    })),
    testPlan: impactReport.acceptanceCriteria ?? [mission.expectedOutcome],
    rollbackPlan: 'Revert feature branch and discard workspace',
    risks: [`Estimated risk: ${impactReport.estimatedRisk}`],
    proposedBy,
    createdAt: new Date().toISOString(),
  };
}
