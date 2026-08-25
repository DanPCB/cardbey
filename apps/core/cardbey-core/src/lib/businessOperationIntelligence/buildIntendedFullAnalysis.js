/**
 * INTENDED-mode full analysis + launch plan — Phase D6.
 * Vertical capability model + evidence-tied recommendations. No viability claims.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { discoverCompetitorCandidates } from './competitorCandidates.js';
import { createEmptyBusinessAnalysisReport, stated } from './fullAnalysisTypes.js';
import { buildVerticalIntelligence } from './recommendationEngine.js';

/**
 * @param {{
 *   context: import('./types.js').BusinessContext,
 *   snapshot: object,
 * }} input
 * @param {object} [deps]
 */
export async function buildIntendedFullAnalysis(input, deps = {}) {
  const { context, snapshot } = input;
  const report = createEmptyBusinessAnalysisReport({
    mode: 'INTENDED',
    contextId: context.contextId,
    snapshotId: snapshot?.snapshotId,
  });

  report.businessContext = {
    name: snapshot?.identity?.name?.value || context.identity?.name,
    businessType: snapshot?.identity?.businessType?.value || context.identity?.businessType,
    category: snapshot?.identity?.category?.value || context.identity?.category,
    location: snapshot?.identity?.location?.value || context.identity?.location,
    operatingModel:
      snapshot?.identity?.operatingModel?.value || context.identity?.operatingModel,
    website: null,
  };

  report.evidence = (context.knowledge || []).map((k) => ({
    field: k.field,
    value: k.value,
    knowledgeState: k.knowledgeState,
    source: k.source || null,
  }));

  report.evidenceSummary = {
    knowledgeCount: (context.knowledge || []).length,
    offeringCount: 0,
    failureCodes: (snapshot?.failures || []).map((f) => f.code),
    limitations: [
      'This is a business idea — not an operating business.',
      'No revenue, customers, or market-share claims are made.',
      ...(snapshot?.assumptions || []).length ? [] : ['Few explicit assumptions were supplied.'],
    ],
  };

  const typeClarificationAnswer = (context.knowledge || []).find(
    (k) => k.field === 'typeClarificationAnswer',
  )?.value;
  const discover = deps.discoverCompetitorCandidates || discoverCompetitorCandidates;
  const cmp = await discover(
    {
      businessName: report.businessContext.name,
      businessType: report.businessContext.businessType,
      category: report.businessContext.category,
      location: report.businessContext.location,
      operatingModel: report.businessContext.operatingModel,
      sourceText: context.sourceText,
      typeClarificationAnswer:
        typeClarificationAnswer != null ? String(typeClarificationAnswer) : null,
      mode: 'INTENDED',
    },
    deps,
  );
  report.competitorCandidates = (cmp.candidates || []).map((c) => ({
    ...c,
    classification: 'possible_comparison_business',
    comparisonClass: c.comparisonClass || 'ADJACENT_COMPARISON',
    note: 'Comparison business in the target area — not proof of demand or competition intensity.',
  }));
  report.marketContext = cmp.marketContext
    ? {
        ...cmp.marketContext,
        limitations:
          'Presence of similar businesses is geographic/category context only — not demand or success probability.',
      }
    : null;

  const intel = await buildVerticalIntelligence(
    {
      context,
      snapshot,
      competitorCandidates: report.competitorCandidates,
    },
    deps,
  );

  report.vertical = { id: intel.vertical.id, label: intel.vertical.label };
  report.signals = intel.signals;
  report.costAudit = intel.costAudit;
  report.customerSegmentHypotheses = intel.customerSegmentHypotheses;

  report.findings = [...intel.findings];
  for (const a of snapshot?.assumptions || []) {
    report.findings.push(
      stated({
        id: `assume_${a.key}`,
        title: a.label,
        detail: String(a.value),
        knowledgeState: a.knowledgeState || KNOWLEDGE_STATES.ASSUMPTION,
      }),
    );
  }
  if (report.marketContext?.statement) {
    report.findings.push(
      stated({
        id: 'area_presence',
        title: 'Target-area category presence',
        detail: report.marketContext.statement,
        knowledgeState: report.marketContext.knowledgeState,
        limitations: report.marketContext.limitations,
      }),
    );
  }

  // Capability requirements (verticalized) + snapshot information gaps
  report.gaps = [...intel.capabilityRequirements];
  for (const g of snapshot?.informationGaps || []) {
    report.unresolvedQuestions.push(g.label);
    report.gaps.push(
      stated({
        id: `need_${g.key}`,
        title: g.label,
        detail: g.why,
        knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
      }),
    );
  }

  // Customer segment hypotheses as findings (AI_INFERENCE)
  for (const seg of intel.customerSegmentHypotheses || []) {
    report.findings.push(
      stated({
        id: `segment_${seg.id}`,
        title: 'Customer segment hypothesis',
        detail: seg.statement,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        limitations: seg.limitations,
      }),
    );
  }

  report.opportunities = intel.opportunities;
  report.recommendations = intel.recommendations;
  report.priorityActions = report.recommendations.slice(0, 4).map((r) => ({
    id: r.id,
    action: r.recommendedAction || r.recommendation,
    priority: r.priority,
    cardbeyAction: r.possibleCardbeyAction,
    specificity: r.specificity,
    knowledgeState: KNOWLEDGE_STATES.RECOMMENDATION,
  }));
  report.plan = intel.plan;

  report.risks.push(
    stated({
      id: 'viability_unknown',
      title: 'Commercial viability unknown',
      detail:
        'A coherent concept snapshot does not imply the business will succeed. Validation is still required.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    }),
  );
  report.risks.push(
    stated({
      id: 'assumption_risk',
      title: 'Assumption risk',
      detail:
        'Customer type, pricing, and demand remain unvalidated unless marked USER_DEFINED with real evidence.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    }),
  );

  report.executiveSummary = {
    text: `Business concept analysis for ${
      report.businessContext.name || 'your idea'
    } (${intel.vertical.label}): Cardbey structured vertical capability requirements, customer-segment hypotheses (AI_INFERENCE), and a recommendation-derived 30/60/90 launch plan. This does not certify viability or demand.`,
    knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
    limitations: report.evidenceSummary.limitations,
  };

  const seen = new Set();
  report.gaps = report.gaps.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });

  return report;
}
