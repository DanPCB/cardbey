/**
 * Generic design planner for the Development Runtime.
 *
 * Generates a DevelopmentDesign from the approved mission, frozen evidence, and
 * impact report. No mission-specific logic; all proposed changes are derived
 * from the impact report's repository-grounded findings.
 */

import type { DevelopmentMission } from '../../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../../types/DevelopmentEvidence.js';
import type { DevelopmentImpactReport } from '../../types/DevelopmentImpactReport.js';
import type { DevelopmentDesign, DevelopmentChangeType } from '../../types/DevelopmentDesign.js';

export interface DesignPlanningInput {
  mission: DevelopmentMission;
  evidence: DevelopmentEvidence;
  impactReport: DevelopmentImpactReport;
  proposedBy: string;
  version: number;
}

export interface DesignPlanner {
  generateDesign(input: DesignPlanningInput): Promise<DevelopmentDesign>;
}

export class RepositoryDesignPlanner implements DesignPlanner {
  async generateDesign(input: DesignPlanningInput): Promise<DevelopmentDesign> {
    const { mission, impactReport, proposedBy, version } = input;

    const files = impactReport.proposedFiles.length > 0
      ? impactReport.proposedFiles
      : evidenceFiles(input.evidence);

    const proposedChanges = files.map((file) => ({
      file,
      purpose: inferPurpose(file, impactReport),
      changeType: 'MODIFY' as DevelopmentChangeType,
    }));

    const testPlan = buildTestPlan(impactReport);
    const risks = buildRisks(impactReport);

    return {
      id: `design-${mission.id}-v${version}`,
      missionId: mission.id,
      version,
      summary: `Design for: ${mission.title}`,
      diagnosis: buildDiagnosis(mission, impactReport),
      proposedChanges,
      testPlan,
      rollbackPlan: 'Revert feature branch and discard workspace',
      risks,
      proposedBy,
      createdAt: new Date().toISOString(),
    };
  }
}

function evidenceFiles(evidence: DevelopmentEvidence): string[] {
  return evidence.suspectedFiles ?? [];
}

function inferPurpose(file: string, impactReport: DevelopmentImpactReport): string {
  const lower = file.toLowerCase();
  if (lower.includes('test.')) return 'Add or update regression tests';
  if (lower.includes('route') || lower.includes('router')) return 'Review routing and navigation impact';
  if (lower.includes('page')) return 'Update page component to satisfy the mission';
  if (lower.includes('component')) return 'Update component behavior per approved design';
  if (lower.includes('hook') || lower.includes('util')) return 'Update shared logic as needed';
  if (impactReport.affectedSystems.includes('database')) return 'Review data model changes';
  return 'Implement smallest valid change per impact analysis';
}

function buildDiagnosis(mission: DevelopmentMission, impactReport: DevelopmentImpactReport): string {
  const parts: string[] = [
    `Mission: ${mission.title}`,
    `Request: ${mission.request}`,
  ];

  if (impactReport.findings && impactReport.findings.length > 0) {
    parts.push(
      'Findings:',
      ...impactReport.findings.map((f) => `- [${f.severity}] ${f.message}`),
    );
  }

  if (impactReport.affectedSystems.length > 0) {
    parts.push(`Affected systems: ${impactReport.affectedSystems.join(', ')}`);
  }

  parts.push(
    `Proposed files (${impactReport.proposedFiles.length}):`,
    ...impactReport.proposedFiles.map((f) => `- ${f}`),
  );

  return parts.join('\n');
}

function buildTestPlan(impactReport: DevelopmentImpactReport): string[] {
  const plan: string[] = [];
  if (impactReport.acceptanceCriteria.length > 0) {
    plan.push(...impactReport.acceptanceCriteria);
  }
  plan.push('Run targeted unit/component tests for changed files');
  if (impactReport.affectedSystems.includes('frontend')) {
    plan.push('Run dashboard build and typecheck');
  }
  if (impactReport.affectedSystems.includes('backend') || impactReport.affectedSystems.includes('api')) {
    plan.push('Run core tests for affected API surface');
  }
  return plan;
}

function buildRisks(impactReport: DevelopmentImpactReport): string[] {
  const risks: string[] = [`Estimated risk: ${impactReport.estimatedRisk}`];
  if (impactReport.securityReviewRequired) risks.push('Security review required');
  if (impactReport.performanceReviewRequired) risks.push('Performance review required');
  if (impactReport.migrationRequired) risks.push('Database or data migration required');
  return risks;
}
