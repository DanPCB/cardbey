/**
 * BusinessAnalysisReport contract — Phase D (DTO only).
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';

export const BUSINESS_ANALYSIS_REPORT_SCHEMA_VERSION = 2;

export const FULL_ANALYSIS_EXISTING_STAGES = Object.freeze([
  { id: 'REVIEWING_EVIDENCE', label: 'Reviewing evidence', userHint: 'Evidence reviewed' },
  { id: 'COMPARING_CONTEXT', label: 'Comparing business context', userHint: 'Local context reviewed' },
  { id: 'IDENTIFYING_GAPS', label: 'Identifying gaps', userHint: 'Gaps identified' },
  { id: 'EVALUATING_OPPORTUNITIES', label: 'Evaluating supported opportunities', userHint: 'Opportunities drafted' },
  { id: 'PREPARING_RECOMMENDATIONS', label: 'Preparing recommendations', userHint: 'Recommendations ready' },
  { id: 'BUILDING_PLAN', label: 'Building growth plan', userHint: '30/60/90 plan ready' },
]);

export const FULL_ANALYSIS_INTENDED_STAGES = Object.freeze([
  { id: 'REVIEWING_CONCEPT', label: 'Reviewing concept', userHint: 'Concept reviewed' },
  { id: 'STRUCTURING_ASSUMPTIONS', label: 'Structuring assumptions', userHint: 'Assumptions structured' },
  {
    id: 'IDENTIFYING_VALIDATION_GAPS',
    label: 'Identifying validation gaps',
    userHint: 'Validation needs listed',
  },
  {
    id: 'MAPPING_CAPABILITY_REQUIREMENTS',
    label: 'Mapping capability requirements',
    userHint: 'Launch requirements mapped',
  },
  { id: 'PREPARING_RECOMMENDATIONS', label: 'Preparing recommendations', userHint: 'Recommendations ready' },
  { id: 'BUILDING_LAUNCH_PLAN', label: 'Building launch plan', userHint: '30/60/90 launch plan ready' },
]);

/**
 * @param {'EXISTING' | 'INTENDED'} mode
 */
export function fullAnalysisStagesForMode(mode) {
  return mode === 'INTENDED' ? FULL_ANALYSIS_INTENDED_STAGES : FULL_ANALYSIS_EXISTING_STAGES;
}

/**
 * @param {Partial<object>} input
 */
export function createEmptyBusinessAnalysisReport(input = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: BUSINESS_ANALYSIS_REPORT_SCHEMA_VERSION,
    reportId: `bar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    mode: input.mode || null,
    reportKind:
      input.mode === 'INTENDED'
        ? 'Business Concept Analysis + Launch Plan'
        : 'Business Analysis + Growth Plan',
    contextId: input.contextId || null,
    snapshotId: input.snapshotId || null,
    executiveSummary: null,
    businessContext: null,
    evidenceSummary: {
      knowledgeCount: 0,
      offeringCount: 0,
      failureCodes: [],
      limitations: [],
    },
    findings: [],
    strengths: [],
    gaps: [],
    opportunities: [],
    risks: [],
    recommendations: [],
    priorityActions: [],
    plan: { day30: [], day60: [], day90: [] },
    competitorCandidates: [],
    marketContext: null,
    unresolvedQuestions: [],
    evidence: [],
    signals: [],
    vertical: null,
    customerSegmentHypotheses: [],
    costAudit: null,
    generatedAt: now,
    phase: 'D6',
  };
}

/**
 * Structured statement with epistemic label.
 * @param {object} partial
 */
export function stated(partial) {
  return {
    id: partial.id || `s_${Math.random().toString(36).slice(2, 8)}`,
    title: partial.title || '',
    detail: partial.detail || '',
    knowledgeState: partial.knowledgeState || KNOWLEDGE_STATES.AI_INFERENCE,
    evidenceRefs: partial.evidenceRefs || [],
    confidence: typeof partial.confidence === 'number' ? partial.confidence : null,
    limitations: partial.limitations || null,
  };
}

/**
 * Recommendation object.
 * @param {object} partial
 */
export function recommendation(partial) {
  return {
    id: partial.id || `rec_${Math.random().toString(36).slice(2, 8)}`,
    title: partial.title || '',
    finding: partial.finding || partial.businessSpecificObservation || '',
    businessSpecificObservation:
      partial.businessSpecificObservation || partial.finding || '',
    evidence: partial.evidence || [],
    evidenceRefs: partial.evidenceRefs || [],
    signal: partial.signal || null,
    interpretation: partial.interpretation || partial.whyItMatters || '',
    whyItMatters: partial.whyItMatters || partial.interpretation || '',
    recommendation: partial.recommendation || partial.recommendedAction || '',
    recommendedAction: partial.recommendedAction || partial.recommendation || '',
    priority: partial.priority || 'medium',
    specificity: partial.specificity || null,
    verticalContext: partial.verticalContext || null,
    requiredCapability: partial.requiredCapability || null,
    possibleCardbeyAction: partial.possibleCardbeyAction || {
      kind: 'manual',
      label: 'Manual action / future capability',
      href: null,
    },
    cardbeyExecution: partial.cardbeyExecution || null,
    knowledgeState: KNOWLEDGE_STATES.RECOMMENDATION,
    supportingStates: partial.supportingStates || [],
    confidence: typeof partial.confidence === 'number' ? partial.confidence : null,
    limitations: partial.limitations || 'Guidance only — not a guaranteed outcome.',
    assumptions: partial.assumptions || [],
    metrics: partial.metrics || {},
  };
}

/**
 * Plan item for 30/60/90.
 * @param {object} partial
 */
export function planItem(partial) {
  return {
    id: partial.id || `plan_${Math.random().toString(36).slice(2, 8)}`,
    action: partial.action || '',
    reason: partial.reason || '',
    priority: partial.priority || 'medium',
    dependency: partial.dependency || null,
    evidenceOrAssumption: partial.evidenceOrAssumption || null,
    knowledgeState: partial.knowledgeState || KNOWLEDGE_STATES.RECOMMENDATION,
    cardbeyAction: partial.cardbeyAction || null,
    expectedOutput: partial.expectedOutput || null,
  };
}

/** Cardbey capability mappings (real routes only). */
export const CARDBEY_ACTIONS = Object.freeze({
  CREATE_OR_CLAIM: {
    kind: 'create_or_claim',
    label: 'Create / claim on Cardbey',
    href: '/for-business',
  },
  SEE_BUSINESS: {
    kind: 'see_business',
    label: 'Continue on See Your Business',
    href: '/see-your-business',
  },
  PERFORMER: {
    kind: 'performer',
    label: 'Open Performer',
    href: '/app/console/control-tower',
  },
  MANUAL: {
    kind: 'manual',
    label: 'Manual action / future capability',
    href: null,
  },
});
