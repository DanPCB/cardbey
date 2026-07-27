/**
 * Explanation API — grounded only in StoreReadinessSnapshot (Phase 2).
 */

import { groupForFinding } from './prioritize.js';

/**
 * @param {import('./types.js').StoreReadinessSnapshot} snapshot
 */
export function explainOverallScore(snapshot) {
  const sections = Object.entries(snapshot.sections || {}).map(([key, s]) => ({
    section: key,
    score: s.score,
    status: s.status,
    findingCount: s.findingCount,
    criticalCount: s.criticalCount,
    importantCount: s.importantCount,
  }));
  const weakest = [...sections].sort((a, b) => a.score - b.score).slice(0, 3);
  const topActions = (snapshot.primaryActions || []).map((a) => ({
    title: a.title,
    group: a.group,
    estimatedImpactPercent: a.estimatedImpactPercent,
    estimatedEffortMinutes: a.estimatedEffortMinutes,
    destinationLabel: a.destinationLabel,
    destination: a.destination,
  }));

  return {
    kind: 'readiness_explanation',
    level: 'overall',
    storeId: snapshot.storeId,
    overallScore: snapshot.overallScore,
    status: snapshot.status,
    summary: `Your store readiness is ${snapshot.overallScore}% (${snapshot.status}).`,
    sections,
    weakestSections: weakest,
    topActions,
    howToImprove: topActions.map(
      (a) =>
        `${a.title} (~+${a.estimatedImpactPercent ?? '?'}% in ~${a.estimatedEffortMinutes ?? '?'} min)`,
    ),
    grounding: 'StoreReadinessSnapshot',
  };
}

/**
 * @param {import('./types.js').StoreReadinessSnapshot} snapshot
 * @param {string} findingCode
 */
export function explainFinding(snapshot, findingCode) {
  const finding = (snapshot.findings || []).find((f) => f.code === findingCode);
  if (!finding) {
    return {
      kind: 'readiness_explanation',
      level: 'finding',
      ok: false,
      error: 'finding_not_found',
      findingCode,
      grounding: 'StoreReadinessSnapshot',
    };
  }
  const section = snapshot.sections?.[finding.category] || null;
  const action = (snapshot.recommendedActions || []).find((a) => a.findingCode === finding.code);

  return {
    kind: 'readiness_explanation',
    level: 'finding',
    ok: true,
    storeId: snapshot.storeId,
    overallScore: snapshot.overallScore,
    section: section
      ? {
          key: finding.category,
          score: section.score,
          status: section.status,
          findingCount: section.findingCount,
        }
      : { key: finding.category },
    finding: {
      code: finding.code,
      title: finding.title,
      severity: finding.severity,
      group: groupForFinding(finding),
      reason: finding.reason || finding.explanation,
      recommendation: finding.recommendation,
      evidence: finding.evidence,
      evidenceLines: finding.evidenceLines || [],
    },
    suggestedAction: action
      ? {
          title: action.title,
          actionType: action.actionType,
          destination: action.destination,
          destinationLabel: action.destinationLabel,
          estimatedImpactPercent: action.estimatedImpactPercent,
          estimatedEffortMinutes: action.estimatedEffortMinutes,
          pilCanAssist: action.pilCanAssist,
          pilCanExecute: false,
        }
      : null,
    narrative: [
      `Overall readiness: ${snapshot.overallScore}%.`,
      section ? `Section "${finding.category}" scores ${section.score}%.` : null,
      `Finding: ${finding.title}.`,
      `Reason: ${finding.reason || finding.explanation}`,
      `Evidence: ${JSON.stringify(finding.evidence || {})}`,
      `Recommendation: ${finding.recommendation}`,
      action?.destinationLabel
        ? `Navigate: ${action.destinationLabel}`
        : action?.destination
          ? `Navigate: ${action.destination}`
          : null,
    ]
      .filter(Boolean)
      .join(' '),
    grounding: 'StoreReadinessSnapshot',
  };
}

/**
 * Answer common seller questions using only the snapshot (+ optional studio meta).
 * @param {import('./types.js').StoreReadinessSnapshot} snapshot
 * @param {string} question
 * @param {{ studioMeta?: Record<string, unknown> }} [opts]
 */
export function answerFromSnapshot(snapshot, question, opts = {}) {
  const q = String(question || '')
    .trim()
    .toLowerCase();
  const studioMeta = opts.studioMeta && typeof opts.studioMeta === 'object' ? opts.studioMeta : {};

  if (!q) {
    return {
      kind: 'seller_grounded_answer',
      answer: explainOverallScore(snapshot).summary,
      explanation: explainOverallScore(snapshot),
      grounding: ['StoreReadinessSnapshot'],
      usedStudioMetaKeys: Object.keys(studioMeta),
    };
  }

  if (/why.*(low|only|\d+|score|readiness)/.test(q) || /readiness only/.test(q)) {
    const overall = explainOverallScore(snapshot);
    return {
      kind: 'seller_grounded_answer',
      answer: `${overall.summary} Weakest sections: ${overall.weakestSections
        .map((s) => `${s.section} (${s.score}%)`)
        .join(', ')}. Fix first: ${(overall.topActions[0] && overall.topActions[0].title) || 'none'}.`,
      explanation: overall,
      grounding: ['StoreReadinessSnapshot'],
      usedStudioMetaKeys: Object.keys(studioMeta),
    };
  }

  if (/fix first|should i (do|fix)|what next|next/.test(q)) {
    const first = (snapshot.primaryActions || [])[0];
    return {
      kind: 'seller_grounded_answer',
      answer: first
        ? `Fix first: ${first.title}. ${first.explanation} Estimated +${first.estimatedImpactPercent}% in ~${first.estimatedEffortMinutes} minutes. ${first.destinationLabel || ''}`.trim()
        : 'No must-fix items — your store looks ready.',
      primaryAction: first || null,
      grounding: ['StoreReadinessSnapshot'],
      usedStudioMetaKeys: Object.keys(studioMeta),
    };
  }

  if (/hero/.test(q)) {
    const heroFindings = (snapshot.findings || []).filter(
      (f) => f.code.includes('HERO') || f.category === 'branding',
    );
    if (!heroFindings.length) {
      return {
        kind: 'seller_grounded_answer',
        answer: 'No hero-related findings in the current readiness snapshot.',
        grounding: ['StoreReadinessSnapshot'],
        usedStudioMetaKeys: Object.keys(studioMeta),
      };
    }
    const explained = explainFinding(snapshot, heroFindings[0].code);
    return {
      kind: 'seller_grounded_answer',
      answer: explained.narrative,
      explanation: explained,
      grounding: ['StoreReadinessSnapshot'],
      usedStudioMetaKeys: Object.keys(studioMeta),
    };
  }

  if (/product|menu|catalog|incomplete/.test(q)) {
    const catalog = (snapshot.findings || []).filter((f) => f.category === 'catalog');
    const titles = catalog.slice(0, 5).map((f) => f.title);
    return {
      kind: 'seller_grounded_answer',
      answer: titles.length
        ? `Products needing attention: ${titles.join('; ')}.`
        : 'No catalog findings in the current readiness snapshot.',
      findings: catalog.slice(0, 8).map((f) => ({
        code: f.code,
        title: f.title,
        evidence: f.evidence,
        recommendation: f.recommendation,
        destinationLabel: f.destinationLabel,
      })),
      grounding: ['StoreReadinessSnapshot'],
      usedStudioMetaKeys: Object.keys(studioMeta),
    };
  }

  const overall = explainOverallScore(snapshot);
  return {
    kind: 'seller_grounded_answer',
    answer: `${overall.summary} Top actions: ${overall.howToImprove.join(' | ') || 'none'}.`,
    explanation: overall,
    grounding: ['StoreReadinessSnapshot'],
    usedStudioMetaKeys: Object.keys(studioMeta),
  };
}
