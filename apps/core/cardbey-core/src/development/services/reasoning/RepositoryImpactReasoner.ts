/**
 * Repository-grounded impact reasoner.
 *
 * Derives impact analysis from frozen evidence and controlled repository
 * inspection. No mission-specific constants or hard-coded recommendations.
 */

import type { ImpactReasoner, ImpactReasoningInput } from './ImpactReasoner.js';
import type { DevelopmentImpactReport } from '../../types/DevelopmentImpactReport.js';
import { LocalRepositoryExplorer } from './repository/LocalRepositoryExplorer.js';
import { RepositoryChangeSurfaceSelector } from './ChangeSurfaceSelector.js';
import { classifyMissionRisk } from '../riskClassifier.js';

export class RepositoryImpactReasoner implements ImpactReasoner {
  async analyse(input: ImpactReasoningInput): Promise<DevelopmentImpactReport> {
    const { mission, evidence, repoRoot, repoRevision } = input;

    const explorer = new LocalRepositoryExplorer();
    const exploration = await explorer.explore({ mission, evidence, repoRoot });

    const selector = new RepositoryChangeSurfaceSelector();
    const selection = await selector.select({
      mission,
      evidence,
      candidates: exploration.candidates,
      repoRoot,
    });

    const proposedFiles = selection.lowConfidence
      ? []
      : dedupe([...selection.changeTargets, ...selection.testTargets]);

    const allRelevantFiles = dedupe([
      ...selection.changeTargets,
      ...selection.contextFiles,
      ...selection.testTargets,
    ]);

    const observedSystems = inferAffectedSystems(evidence, allRelevantFiles);
    const modifiedSystems = inferAffectedSystems(undefined, proposedFiles);
    const affectedSystems = new Set([...observedSystems, ...modifiedSystems]);
    const canonicalPath = deriveCanonicalPath(evidence);

    const findings: DevelopmentImpactReport['findings'] = [];

    findings.push({
      severity: 'INFO',
      message: `Repository snapshot: ${repoRoot} @ ${repoRevision || 'unknown'}`,
      location: 'repository-impact-reasoner',
    });

    for (const finding of exploration.findings) {
      findings.push({
        severity: 'INFO',
        message: finding,
        location: 'repository explorer',
      });
    }

    for (const finding of selection.findings) {
      findings.push({
        severity: 'INFO',
        message: finding,
        location: 'change surface selector',
      });
    }

    if (proposedFiles.length === 0) {
      findings.push({
        severity: 'INFO',
        message: 'No change targets identified. Human inspection is required before design approval.',
        location: 'change surface selector',
      });
    }

    const recommendations: string[] = [];
    if (proposedFiles.length > 0) {
      recommendations.push('Inspect proposed files to confirm relevance before design approval.');
    }
    if (selection.lowConfidence) {
      recommendations.push('Change surface confidence is low — add suspectedFiles or refine the mission description.');
    }
    if (evidence.affectedRoutes && evidence.affectedRoutes.length > 0) {
      recommendations.push('Verify affected routes render correctly after the change.');
    }
    recommendations.push('Add or update regression tests covering the changed behavior.');

    const acceptanceCriteria = [mission.expectedOutcome];
    if (evidence.affectedRoutes && evidence.affectedRoutes.length > 0) {
      acceptanceCriteria.push(...evidence.affectedRoutes.map((r) => `${r} behaves as expected`));
    }

    return {
      id: `imp-${mission.id}`,
      missionId: mission.id,
      affectedSystems: Array.from(affectedSystems),
      observedSystems: Array.from(observedSystems),
      modifiedSystems: Array.from(modifiedSystems),
      canonicalPath,
      legacyPaths: [],
      proposedFiles,
      migrationRequired: false,
      securityReviewRequired: affectedSystems.has('auth') || affectedSystems.has('runtime-authority'),
      performanceReviewRequired: affectedSystems.has('performance') || mission.type === 'PERFORMANCE',
      estimatedRisk: classifyMissionRisk({
        mission,
        evidence,
        proposedFiles,
        affectedSystems: Array.from(affectedSystems),
      }),
      estimatedEffort: inferEffort(proposedFiles),
      acceptanceCriteria,
      findings,
      recommendations,
      changeSurface: {
        changeTargets: selection.changeTargets,
        contextFiles: selection.contextFiles,
        testTargets: selection.testTargets,
        lowRelevance: selection.lowRelevance,
        lowConfidence: selection.lowConfidence,
      },
      repoRoot,
      repoRevision,
      generatedAt: new Date(),
      generatedBy: 'repository-impact-reasoner',
    };
  }
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function inferAffectedSystems(
  evidence: ImpactReasoningInput['evidence'] | undefined,
  proposedFiles: string[],
): Set<string> {
  const systems = new Set<string>();

  if (evidence) {
    for (const route of evidence.affectedRoutes ?? []) {
      if (route.startsWith('/app') || route.startsWith('/console')) {
        systems.add('frontend');
        systems.add('routing');
      }
      if (route.startsWith('/api')) systems.add('api');
    }
  }

  for (const file of proposedFiles) {
    const n = file.toLowerCase();
    if (n.includes('app.jsx') || n.includes('route') || n.includes('router')) systems.add('routing');
    if (n.includes('auth')) systems.add('auth');
    if (n.includes('runtimeauthority')) systems.add('runtime-authority');
    if (n.endsWith('.tsx') || n.endsWith('.jsx')) systems.add('frontend');
    if (n.endsWith('.ts') || n.endsWith('.js')) systems.add('backend');
    if (n.includes('prisma') || n.includes('schema')) systems.add('database');
    if (n.includes('test.')) systems.add('tests');
  }

  if (systems.size === 0) systems.add('unknown');
  return systems;
}

function deriveCanonicalPath(evidence: ImpactReasoningInput['evidence']): string {
  const routes = evidence.affectedRoutes ?? [];
  if (routes.length > 0) return routes[0]!;
  return '/';
}

function inferEffort(proposedFiles: string[]): DevelopmentImpactReport['estimatedEffort'] {
  if (proposedFiles.length <= 2) return 'SMALL';
  if (proposedFiles.length <= 6) return 'MEDIUM';
  return 'LARGE';
}
