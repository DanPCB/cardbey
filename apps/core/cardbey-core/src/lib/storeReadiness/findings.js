/**
 * Finding factory + severity helpers (Phase 2: structured evidence).
 */

import { normalizeEvidence } from './evidence.js';
import { impactForFindingCode } from './impact.js';
import { resolveDestinationLabel } from './destinations.js';

/**
 * @param {object} input
 * @returns {import('./types.js').StoreReadinessFinding}
 */
export function createFinding(input) {
  const now = input.generatedAt || new Date().toISOString();
  const { structured, lines } = normalizeEvidence(input.evidence);
  const impact = impactForFindingCode(String(input.code));
  const reason = String(input.reason || input.explanation || '');
  const recommendation = String(
    input.recommendation || input.title || 'Review this item in Business Studio.',
  );
  const destination = input.destination || null;
  const destinationLabel =
    input.destinationLabel ||
    resolveDestinationLabel({
      destinationKey: input.destinationKey,
      destination,
      affectedObject: input.affectedObject,
    });

  return {
    code: String(input.code),
    severity: input.severity,
    category: String(input.category),
    title: String(input.title),
    explanation: reason,
    reason,
    recommendation,
    /** Structured evidence (Phase 2). */
    evidence: structured,
    /** Display / sanitize lines (compat). */
    evidenceLines: lines,
    affectedObject: input.affectedObject || null,
    recommendedActionType: input.recommendedActionType || 'navigate',
    destination,
    destinationKey: input.destinationKey || null,
    destinationLabel,
    destinationFilter: input.destinationFilter || null,
    estimatedImpactPercent:
      input.estimatedImpactPercent != null
        ? Number(input.estimatedImpactPercent)
        : impact.estimatedImpactPercent,
    estimatedEffortMinutes:
      input.estimatedEffortMinutes != null
        ? Number(input.estimatedEffortMinutes)
        : impact.estimatedEffortMinutes,
    impactLabel: input.impactLabel || impact.impactLabel,
    pilCanAssist: Boolean(input.pilCanAssist),
    pilCanExecute: false,
    generatedAt: now,
  };
}

/** @param {'critical'|'important'|'improvement'|'optional'} severity */
export function severityWeight(severity) {
  switch (severity) {
    case 'critical':
      return 100;
    case 'important':
      return 70;
    case 'improvement':
      return 40;
    case 'optional':
      return 10;
    default:
      return 0;
  }
}

/**
 * @param {import('./types.js').StoreReadinessFinding[]} findings
 */
export function buildSectionFromFindings(findings, sectionKey) {
  const sectionFindings = findings.filter((f) => f.category === sectionKey);
  const critical = sectionFindings.filter((f) => f.severity === 'critical').length;
  const important = sectionFindings.filter((f) => f.severity === 'important').length;
  const improvement = sectionFindings.filter(
    (f) => f.severity === 'improvement' || f.severity === 'optional',
  ).length;
  const totalIssues = sectionFindings.length;
  const score =
    totalIssues === 0
      ? 100
      : Math.max(0, 100 - critical * 35 - important * 18 - improvement * 8);
  return {
    key: sectionKey,
    score: Math.min(100, Math.round(score)),
    status:
      critical > 0
        ? 'blocked'
        : important > 0
          ? 'needs_attention'
          : improvement > 0
            ? 'improving'
            : 'complete',
    findingCount: totalIssues,
    criticalCount: critical,
    importantCount: important,
  };
}
