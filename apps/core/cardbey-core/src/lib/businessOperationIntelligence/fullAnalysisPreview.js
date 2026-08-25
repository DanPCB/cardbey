/**
 * Full Analysis Preview — V1 pilot productization.
 * Derived from a real BusinessAnalysisReport. Never fabricates counts or findings.
 */

/**
 * @param {object | null | undefined} report
 * @returns {{
 *   ok: boolean,
 *   ready: boolean,
 *   mode: string | null,
 *   headline: string,
 *   counts: {
 *     findings: number,
 *     priorityActions: number,
 *     comparisons: number,
 *     planItems: number,
 *     hasPlan: boolean,
 *   },
 *   highlights: string[],
 *   sampleFinding: {
 *     title: string,
 *     observation: string,
 *     whyItMatters: string | null,
 *     knowledgeState: string | null,
 *   } | null,
 *   unlockEnticements: string[],
 *   limitations: string[],
 * } | { ok: false, ready: false, error: string }}
 */
export function buildFullAnalysisPreview(report) {
  if (!report || typeof report !== 'object') {
    return { ok: false, ready: false, error: 'report_missing' };
  }

  const findings = Array.isArray(report.findings) ? report.findings : [];
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
  const priorityActions = Array.isArray(report.priorityActions)
    ? report.priorityActions
    : recommendations.filter((r) => r.priority === 'HIGH' || r.priority === 'MEDIUM');
  const comparisons = Array.isArray(report.competitorCandidates) ? report.competitorCandidates : [];
  const plan = report.plan || {};
  const planItems =
    (Array.isArray(plan.day30) ? plan.day30.length : 0) +
    (Array.isArray(plan.day60) ? plan.day60.length : 0) +
    (Array.isArray(plan.day90) ? plan.day90.length : 0);

  const specificFindings = findings.filter(
    (f) => f && (f.detail || f.title) && String(f.detail || '').length > 12,
  );
  const bizRecs = recommendations.filter(
    (r) =>
      r &&
      (r.specificity === 'BUSINESS_SPECIFIC' ||
        r.specificity === 'EVIDENCE_SPECIFIC' ||
        r.businessSpecificObservation),
  );

  const sampleSource =
    bizRecs[0] ||
    recommendations[0] ||
    (specificFindings[0]
      ? {
          title: specificFindings[0].title,
          businessSpecificObservation: specificFindings[0].detail,
          whyItMatters: null,
          knowledgeState: specificFindings[0].knowledgeState,
        }
      : null);

  const sampleFinding = sampleSource
    ? {
        title: String(sampleSource.title || 'What we noticed'),
        observation: String(
          sampleSource.businessSpecificObservation ||
            sampleSource.finding ||
            sampleSource.detail ||
            '',
        ).slice(0, 400),
        whyItMatters: sampleSource.whyItMatters
          ? String(sampleSource.whyItMatters).slice(0, 280)
          : sampleSource.interpretation
            ? String(sampleSource.interpretation).slice(0, 280)
            : null,
        knowledgeState: sampleSource.knowledgeState || null,
      }
    : null;

  const highlights = [];
  if (specificFindings.length || findings.length) {
    highlights.push(
      `${Math.max(specificFindings.length, findings.length)} business-specific finding${
        Math.max(specificFindings.length, findings.length) === 1 ? '' : 's'
      }`,
    );
  }
  if (priorityActions.length || recommendations.length) {
    const n = priorityActions.length || recommendations.length;
    highlights.push(`${n} priority action${n === 1 ? '' : 's'}`);
  }
  if (comparisons.length) {
    highlights.push(
      `${comparisons.length} relevant business${comparisons.length === 1 ? '' : 'es'} worth comparing`,
    );
  } else if (report.marketContext?.statement) {
    highlights.push('Honest comparison result for this market');
  }
  if (planItems > 0) {
    highlights.push('A 30 / 60 / 90-day growth plan');
  }

  const unlockEnticements = [
    'all findings',
    'business comparisons',
    'priority recommendations',
    'Cardbey actions',
    '30 / 60 / 90-day plan',
  ];

  const limitations = [];
  if (report.executiveSummary?.limitations?.length) {
    limitations.push(...report.executiveSummary.limitations.slice(0, 3));
  }
  if (!comparisons.length) {
    limitations.push('No sufficiently relevant comparison businesses were verified for display.');
  }

  return {
    ok: true,
    ready: true,
    mode: report.mode || null,
    headline: 'Your business analysis is ready',
    counts: {
      findings: specificFindings.length || findings.length,
      priorityActions: priorityActions.length || recommendations.length,
      comparisons: comparisons.length,
      planItems,
      hasPlan: planItems > 0,
    },
    highlights,
    sampleFinding,
    unlockEnticements,
    limitations,
    reportId: report.reportId || null,
    vertical: report.vertical || null,
  };
}
