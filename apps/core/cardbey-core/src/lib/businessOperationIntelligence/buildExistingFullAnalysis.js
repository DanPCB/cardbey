/**
 * EXISTING-mode full analysis + growth plan — Phase D6 (vertical intelligence).
 * Truth layer (context/snapshot) unchanged; recommendations are signal-driven.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { discoverCompetitorCandidates } from './competitorCandidates.js';
import { createEmptyBusinessAnalysisReport, stated } from './fullAnalysisTypes.js';
import { buildVerticalIntelligence } from './recommendationEngine.js';
import { SIGNAL_TYPES, hasSignal } from './businessSignals.js';

/**
 * @param {{
 *   context: import('./types.js').BusinessContext,
 *   snapshot: object,
 * }} input
 * @param {object} [deps]
 */
export async function buildExistingFullAnalysis(input, deps = {}) {
  const { context, snapshot } = input;
  const report = createEmptyBusinessAnalysisReport({
    mode: 'EXISTING',
    contextId: context.contextId,
    snapshotId: snapshot?.snapshotId,
  });

  report.businessContext = {
    name: snapshot?.identity?.name?.value || context.identity?.name,
    businessType: snapshot?.identity?.businessType?.value || context.identity?.businessType,
    category: snapshot?.identity?.category?.value || context.identity?.category,
    location: snapshot?.identity?.location?.value || context.identity?.location,
    website: snapshot?.identity?.website?.value || context.identity?.website,
  };

  report.evidence = (context.knowledge || []).map((k) => ({
    field: k.field,
    value: k.value,
    knowledgeState: k.knowledgeState,
    source: k.source || null,
  }));

  report.evidenceSummary = {
    knowledgeCount: (context.knowledge || []).length,
    offeringCount: snapshot?.offerings?.count || 0,
    failureCodes: (snapshot?.failures || []).map((f) => f.code),
    limitations: buildLimitations(snapshot),
  };

  // Business comparisons (context-derived discovery)
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
      offerings: (snapshot?.offerings?.items || []).map((i) => i.name).filter(Boolean),
      operatingModel: context.identity?.operatingModel,
      sourceText: context.sourceText,
      typeClarificationAnswer:
        typeClarificationAnswer != null ? String(typeClarificationAnswer) : null,
      mode: 'EXISTING',
    },
    deps,
  );
  report.competitorCandidates = cmp.candidates || [];
  report.marketContext = cmp.marketContext;

  const intel = await buildVerticalIntelligence(
    {
      context,
      snapshot,
      competitorCandidates: report.competitorCandidates,
    },
    deps,
  );

  report.vertical = {
    id: intel.vertical.id,
    label: intel.vertical.label,
  };
  report.signals = intel.signals;
  report.costAudit = intel.costAudit;
  report.customerSegmentHypotheses = intel.customerSegmentHypotheses;

  // Findings: prefer signal-derived meaning over FREE restatement
  report.findings = [...intel.findings];
  if (report.marketContext?.statement) {
    report.findings.push(
      stated({
        id: 'market_context',
        title: 'Local category presence',
        detail: report.marketContext.statement,
        knowledgeState: report.marketContext.knowledgeState,
        limitations: report.marketContext.limitations,
      }),
    );
  }

  // Strengths / gaps from signals (not FREE identity dump)
  report.strengths = buildStrengths(intel.signals, snapshot);
  report.gaps = buildGaps(intel.signals, snapshot);

  report.opportunities = intel.opportunities;
  report.recommendations = intel.recommendations;
  report.priorityActions = report.recommendations
    .slice()
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      action: r.recommendedAction || r.recommendation,
      priority: r.priority,
      cardbeyAction: r.possibleCardbeyAction,
      specificity: r.specificity,
      knowledgeState: KNOWLEDGE_STATES.RECOMMENDATION,
    }));

  report.plan = intel.plan;

  if ((snapshot?.failures || []).length) {
    report.risks.push(
      stated({
        id: 'evidence_limits',
        title: 'Evidence limits',
        detail: (snapshot.failures || []).map((f) => f.message).join(' '),
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      }),
    );
  }
  report.risks.push(
    stated({
      id: 'no_demand_claim',
      title: 'No demand or revenue claim',
      detail:
        'This report does not estimate demand, market size, or revenue. Local similar-business counts are presence context only.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    }),
  );

  report.unresolvedQuestions = buildExistingQuestions(report, snapshot, intel);
  report.executiveSummary = buildExistingExecutiveSummary(report, intel);

  return report;
}

function buildStrengths(signals, snapshot) {
  const out = [];
  if (hasSignal(signals, SIGNAL_TYPES.DIGITAL_PRESENCE_STRONG)) {
    out.push(
      stated({
        id: 'strength_digital',
        title: 'Strong digital evidence base',
        detail: signals.find((s) => s.type === SIGNAL_TYPES.DIGITAL_PRESENCE_STRONG).observation,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      }),
    );
  }
  if (hasSignal(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT)) {
    out.push(
      stated({
        id: 'strength_catalog',
        title: 'Documented offerings online',
        detail: signals.find((s) => s.type === SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT).observation,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      }),
    );
  }
  if (hasSignal(signals, SIGNAL_TYPES.SOCIAL_PRESENCE_FOUND)) {
    out.push(
      stated({
        id: 'strength_social',
        title: 'Social links found',
        detail: signals.find((s) => s.type === SIGNAL_TYPES.SOCIAL_PRESENCE_FOUND).observation,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      }),
    );
  }
  void snapshot;
  return out;
}

function buildGaps(signals, snapshot) {
  const out = [];
  const gapTypes = [
    SIGNAL_TYPES.STRUCTURED_CATALOG_MISSING,
    SIGNAL_TYPES.WEBSITE_MISSING,
    SIGNAL_TYPES.WEBSITE_UNREACHABLE,
    SIGNAL_TYPES.OFFERING_DESCRIPTION_SPARSE,
    SIGNAL_TYPES.OFFERING_STRUCTURE_FRAGMENTED,
    SIGNAL_TYPES.CONTACT_PATH_UNCLEAR,
    SIGNAL_TYPES.SERVICE_AREA_UNKNOWN,
    SIGNAL_TYPES.BUSINESS_IDENTITY_FRAGMENTED,
  ];
  for (const type of gapTypes) {
    const s = signals.find((x) => x.type === type);
    if (!s) continue;
    out.push(
      stated({
        id: `gap_${type.toLowerCase()}`,
        title: type.replace(/_/g, ' ').toLowerCase(),
        detail: s.observation,
        knowledgeState: s.knowledgeState,
        evidenceRefs: s.evidenceRefs,
        limitations: s.limitations,
      }),
    );
  }
  void snapshot;
  return out;
}

function buildLimitations(snapshot) {
  const out = [];
  if (!snapshot?.identity?.website?.value) out.push('No verified website on snapshot.');
  if (snapshot?.offerings?.status !== 'found') out.push('No evidence-backed offering catalog.');
  if ((snapshot?.failures || []).some((f) => f.code === 'business_unresolved')) {
    out.push('Public listing was not fully resolved.');
  }
  return out;
}

function buildExistingQuestions(report, snapshot, intel) {
  const q = [];
  if (!report.businessContext.website) q.push('What is the preferred public website URL?');
  if (snapshot?.offerings?.status !== 'found') q.push('What are the core products or services you sell?');
  if (!report.competitorCandidates.length) {
    q.push('Which businesses do customers usually compare you with?');
  }
  if (hasSignal(intel.signals, SIGNAL_TYPES.SERVICE_AREA_UNKNOWN)) {
    q.push('What geographic service area do you actually cover?');
  }
  if (hasSignal(intel.signals, SIGNAL_TYPES.CONTACT_PATH_UNCLEAR)) {
    q.push('What is the primary customer action you want (call, form, booking, quote)?');
  }
  return q.slice(0, 6);
}

function buildExistingExecutiveSummary(report, intel) {
  const name = report.businessContext?.name || 'This business';
  const recN = report.recommendations.length;
  const specificN = report.recommendations.filter((r) =>
    ['EVIDENCE_SPECIFIC', 'BUSINESS_SPECIFIC'].includes(r.specificity),
  ).length;
  const cmpN = report.competitorCandidates.length;
  return {
    text: `${name}: Cardbey analysed ${intel.vertical.label} evidence into ${recN} specificity-gated recommendation(s) (${specificN} business/evidence-specific). ${cmpN} comparison candidate(s) met relevance thresholds. No demand, revenue, or success-probability claims are made.`,
    knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
    limitations: report.evidenceSummary.limitations,
  };
}

function priorityRank(p) {
  if (p === 'high') return 0;
  if (p === 'medium') return 1;
  return 2;
}
