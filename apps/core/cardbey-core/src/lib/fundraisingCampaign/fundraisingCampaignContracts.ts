/**
 * Fundraising Campaign V1 — contracts, lifecycle, events.
 * Does not redesign Market Intent / reciprocal / capital qualification / INVESTOR_FIT_V1.
 */

export const FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026 = 'CARDBEY_SEED_2026';
/** Stable primary key for dual-write / hydrate (must not rotate across process restarts). */
export const FUNDRAISING_CAMPAIGN_ID_CARDBEY_SEED_2026 = 'campaign_cardbey_seed_2026';

export const FUNDRAISING_CAMPAIGN_STATES = Object.freeze({
  PREPARING: 'PREPARING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CLOSED: 'CLOSED',
});

/** Canonical campaign investor lifecycle (founder-operated). */
export const FUNDRAISING_TARGET_LIFECYCLE = Object.freeze({
  TARGET: 'TARGET',
  RESEARCHED: 'RESEARCHED',
  INTRO_REQUESTED: 'INTRO_REQUESTED',
  CONTACTED: 'CONTACTED',
  RESPONDED: 'RESPONDED',
  MEETING: 'MEETING',
  FOLLOW_UP: 'FOLLOW_UP',
  DILIGENCE: 'DILIGENCE',
  PARTNER_MEETING: 'PARTNER_MEETING',
  TERM_DISCUSSION: 'TERM_DISCUSSION',
  COMMITTED: 'COMMITTED',
  PASSED: 'PASSED',
});

const ORDER = [
  'TARGET',
  'RESEARCHED',
  'INTRO_REQUESTED',
  'CONTACTED',
  'RESPONDED',
  'MEETING',
  'FOLLOW_UP',
  'DILIGENCE',
  'PARTNER_MEETING',
  'TERM_DISCUSSION',
  'COMMITTED',
];

export const FUNDRAISING_EVENTS = Object.freeze({
  CAPITAL_MATCH_REVIEWED: 'CAPITAL_MATCH_REVIEWED',
  INVESTOR_ADMITTED: 'INVESTOR_ADMITTED',
  RESEARCH_GAP_CREATED: 'RESEARCH_GAP_CREATED',
  RESEARCH_GAP_RESOLVED: 'RESEARCH_GAP_RESOLVED',
  OUTREACH_DRAFT_CREATED: 'OUTREACH_DRAFT_CREATED',
  OUTREACH_DRAFT_APPROVED: 'OUTREACH_DRAFT_APPROVED',
  /** @deprecated alias — prefer OUTREACH_DRAFT_APPROVED */
  OUTREACH_APPROVED: 'OUTREACH_DRAFT_APPROVED',
  LIFECYCLE_CHANGED: 'LIFECYCLE_CHANGED',
  MEETING_RECORDED: 'MEETING_RECORDED',
  DILIGENCE_STARTED: 'DILIGENCE_STARTED',
  INVESTOR_PASSED: 'INVESTOR_PASSED',
  INVESTOR_COMMITTED: 'INVESTOR_COMMITTED',
  CAMPAIGN_STATE_CHANGED: 'CAMPAIGN_STATE_CHANGED',
  DOCUMENT_REGISTERED: 'DOCUMENT_REGISTERED',
  FUNDRAISING_CAMPAIGN_VIEWED: 'FUNDRAISING_CAMPAIGN_VIEWED',
  INVESTOR_RESEARCH_STARTED: 'INVESTOR_RESEARCH_STARTED',
  DOSSIER_VIEWED: 'DOSSIER_VIEWED',
  DOCUMENT_READINESS_CHANGED: 'DOCUMENT_READINESS_CHANGED',
  INVESTOR_QUESTION_RECORDED: 'INVESTOR_QUESTION_RECORDED',
  EVIDENCE_GAP_CREATED: 'EVIDENCE_GAP_CREATED',
});

export const SUITCASE_SEED_DOCUMENTS = Object.freeze([
  { category: 'Pitch', title: 'Pitch Deck', evidenceStatus: 'UNKNOWN' },
  { category: 'Pitch', title: 'One-page Investment Memo', evidenceStatus: 'UNKNOWN' },
  { category: 'Pitch', title: 'Product Demo', evidenceStatus: 'UNKNOWN' },
  { category: 'Evidence', title: 'Product evidence', evidenceStatus: 'PARTIAL' },
  { category: 'Evidence', title: 'Operating history', evidenceStatus: 'PARTIAL' },
  { category: 'Evidence', title: 'Traction / validation evidence', evidenceStatus: 'UNKNOWN' },
  { category: 'Evidence', title: 'Evidence program notes', evidenceStatus: 'UNKNOWN' },
  { category: 'Company', title: 'Corporate information', evidenceStatus: 'UNKNOWN' },
  { category: 'Company', title: 'Founder / team', evidenceStatus: 'PARTIAL' },
  { category: 'Round', title: 'Round summary (proposed)', evidenceStatus: 'PROPOSED' },
  { category: 'Round', title: 'SAFE draft', evidenceStatus: 'UNKNOWN' },
  { category: 'Round', title: 'Use of funds', evidenceStatus: 'PROPOSED' },
  { category: 'Diligence', title: 'Financial DD pack', evidenceStatus: 'UNKNOWN' },
  { category: 'Diligence', title: 'Legal DD pack', evidenceStatus: 'UNKNOWN' },
  { category: 'Diligence', title: 'Technology DD pack', evidenceStatus: 'UNKNOWN' },
  { category: 'Diligence', title: 'Market DD pack', evidenceStatus: 'UNKNOWN' },
]);

/** Three assessment systems — never merge into one score. */
export type AssessmentProvenanceBundle = {
  reciprocal: {
    band: string;
    matcherVersion?: string | null;
    evidenceConfidence?: string | null;
    matchReasons?: string[];
    conflicts?: string[];
    unknowns?: string[];
  } | null;
  capitalQualification: {
    band: string;
    compatibleFactors?: string[];
    contradictions?: string[];
    unknowns?: string[];
    rankingReasons?: string[];
    reviewPriority?: number;
  } | null;
  investorFit: {
    kind: 'INVESTOR_FIT_V1';
    total: number | null;
    confidencePct: number | null;
    tier?: string | null;
    intelligenceStatus?: string | null;
    whyItFits?: string[];
    potentialConcerns?: string[];
  } | null;
};

export function isTerminalLifecycle(state: string): boolean {
  return state === FUNDRAISING_TARGET_LIFECYCLE.COMMITTED || state === FUNDRAISING_TARGET_LIFECYCLE.PASSED;
}

export function canTransitionLifecycle(from: string, to: string): { ok: boolean; reason?: string } {
  if (from === to) return { ok: false, reason: 'same_state' };
  if (isTerminalLifecycle(from)) return { ok: false, reason: 'terminal_state' };
  if (to === FUNDRAISING_TARGET_LIFECYCLE.PASSED) return { ok: true };
  if (!Object.values(FUNDRAISING_TARGET_LIFECYCLE).includes(to as any)) {
    return { ok: false, reason: 'unknown_target_state' };
  }
  const fromIdx = ORDER.indexOf(from);
  const toIdx = ORDER.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return { ok: false, reason: 'unknown_state' };
  // Allow forward moves and limited one-step back for correction (not silent overwrite — caller must record history)
  if (toIdx >= fromIdx) return { ok: true };
  if (toIdx === fromIdx - 1) return { ok: true };
  return { ok: false, reason: 'invalid_transition' };
}

export function newId(prefix = 'fc'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
