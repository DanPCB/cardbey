import { DevelopmentMission } from '../types/DevelopmentMission';
import { DevelopmentEvidence } from '../types/DevelopmentEvidence';

export interface PlannerOutput {
  analysis: string;
  affectedSystems: string[];
  proposedFiles: string[];
  migrationRequired: boolean;
  securityReviewRequired: boolean;
  estimatedRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  acceptanceCriteria: string[];
  recommendations: string[];
}

export class DevelopmentPlannerAgent {
  async analyse(
    mission: DevelopmentMission,
    evidence: DevelopmentEvidence
  ): Promise<PlannerOutput> {
    const proposedFiles =
      evidence.suspectedFiles?.length > 0
        ? [...evidence.suspectedFiles]
        : [];

    const affectedSystems = new Set<string>();

    for (const route of evidence.affectedRoutes ?? []) {
      if (
        route.startsWith('/app') ||
        route.startsWith('/console')
      ) {
        affectedSystems.add('frontend');
        affectedSystems.add('routing');
        affectedSystems.add('console');
      }
    }

    for (const file of proposedFiles) {
      const normalized = file.toLowerCase();

      if (
        normalized.includes('app.jsx') ||
        normalized.includes('router') ||
        normalized.includes('route')
      ) {
        affectedSystems.add('routing');
      }

      if (normalized.includes('shell')) {
        affectedSystems.add('layout');
      }

      if (
        normalized.includes('sidebar') ||
        normalized.includes('navigation')
      ) {
        affectedSystems.add('navigation');
      }

      if (
        normalized.endsWith('.tsx') ||
        normalized.endsWith('.jsx')
      ) {
        affectedSystems.add('frontend');
      }
    }

    return {
      analysis: `
## Impact Analysis

### Problem
${mission.request}

### Expected Behaviour
${mission.expectedOutcome}

### Current Behaviour
${mission.observedBehaviour || 'Not specified'}

### Evidence
- ${evidence.logs?.length ?? 0} log entries
- ${evidence.screenshots?.length ?? 0} screenshots
- ${evidence.requestIds?.length ?? 0} request IDs
- ${evidence.affectedRoutes?.length ?? 0} affected routes

### Proposed Approach
1. Inspect the affected routes
2. Trace the component and layout hierarchy
3. Identify the duplicate shell or sidebar owner
4. Implement the smallest valid fix
5. Add regression tests
      `.trim(),

      affectedSystems:
        affectedSystems.size > 0
          ? Array.from(affectedSystems)
          : ['unknown'],

      proposedFiles,

      migrationRequired: false,

      securityReviewRequired:
        mission.type === 'SECURITY_PATCH',

      estimatedRisk: mission.riskLevel,

      acceptanceCriteria: [
        mission.expectedOutcome,
        'All required tests pass',
        'Code review is completed',
        'Staging verification passes',
      ],

      recommendations: [
        'Keep ConsoleShell as the only owner of ConsoleSidebar',
        'Do not hide the duplicate sidebar with CSS',
        'Add a route-shell regression test',
        'Verify /app, /app/missions, and /app/development',
      ],
    };
  }
}