/**
 * Cardbey Seed 2026 campaign preparation content — USP, acquisition thesis, investor Q readiness.
 * Epistemic rules: VERIFIED / PROPOSED / HISTORICAL / VALIDATING / DIRECTION / UNKNOWN / HYPOTHESIS.
 * No fabricated traction metrics.
 */

export type EpistemicStatus =
  | 'VERIFIED'
  | 'PROPOSED'
  | 'HISTORICAL'
  | 'VALIDATING'
  | 'DIRECTION'
  | 'UNKNOWN'
  | 'HYPOTHESIS'
  | 'DISTRIBUTION_ARCHITECTURE'
  | 'EXISTING_CAPABILITY';

export type SuitcaseArtifactReadiness =
  | 'READY'
  | 'DRAFT'
  | 'MISSING'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'EVIDENCE_REQUIRED';

/** Registry placeholder ≠ READY artifact. contentRef null ⇒ not READY. */
export function classifySuitcaseArtifact(doc: {
  title: string;
  status: string;
  evidenceStatus: string;
  contentRef?: string | null;
  visibility?: string;
}): {
  readiness: SuitcaseArtifactReadiness;
  reason: string;
} {
  if (!doc.contentRef) {
    if (doc.evidenceStatus === 'PROPOSED') {
      return {
        readiness: 'DRAFT',
        reason: 'Registry placeholder with proposed terms only — no attached artifact',
      };
    }
    if (doc.evidenceStatus === 'PARTIAL') {
      return {
        readiness: 'EVIDENCE_REQUIRED',
        reason: 'Partial evidence claimed but no contentRef — not READY',
      };
    }
    return {
      readiness: 'MISSING',
      reason: 'Suitcase registry entry only — software placeholder is not a READY document',
    };
  }
  if (doc.status === 'DRAFT') {
    return { readiness: 'DRAFT', reason: 'Artifact attached but still DRAFT' };
  }
  if (/SAFE|legal/i.test(doc.title) && doc.status !== 'APPROVED') {
    return { readiness: 'LEGAL_REVIEW_REQUIRED', reason: 'Legal instrument requires review before READY' };
  }
  if (doc.status === 'READY' || doc.status === 'APPROVED') {
    return { readiness: 'READY', reason: 'Content attached and marked ready' };
  }
  return { readiness: 'DRAFT', reason: `Status ${doc.status}` };
}

export const CARDBEY_CORE_USP = Object.freeze({
  statement:
    'Cardbey understands what economic actors HAVE and WANT, then helps discover, match and coordinate the resources required to move them forward.',
  mechanism: {
    left: 'ACTOR.HAS',
    coordination: 'CARDBEY COORDINATION',
    right: 'ACTOR.WANTS',
  },
  examples: [
    'Startup ↔ Investor',
    'Manufacturer ↔ Distributor',
    'Business ↔ Customer',
    'Business ↔ Service Provider',
    'Creator ↔ Business',
  ],
  epistemicStatus: 'EXISTING_CAPABILITY' as EpistemicStatus,
  note: 'Examples of one Resource Aggregation Accelerator mechanism — not five separate marketplace products.',
});

export const CARDBEY_ACQUISITION_THESIS = Object.freeze({
  title: 'User-acquisition / distribution hypothesis',
  notClaims: [
    'proven low CAC',
    'acquisition without CAC',
    'proven network effects',
    'proven packaging acquisition economics',
    'proven CNET acquisition economics',
    'guaranteed organic growth',
  ],
  channels: [
    {
      id: 'EXTERNAL_DIGITAL',
      label: 'External digital',
      items: ['social networks', 'search', 'online communities', 'content', 'referrals', 'partnerships'],
      epistemicStatus: 'HYPOTHESIS' as EpistemicStatus,
    },
    {
      id: 'CARDBEY_OWNED_DIGITAL',
      label: 'Cardbey-owned digital surfaces',
      items: ['stores/business presence', 'marketplace/content surfaces', 'Launchpad', 'internal resource/opportunity network'],
      epistemicStatus: 'EXISTING_CAPABILITY' as EpistemicStatus,
    },
    {
      id: 'PHYSICAL_TO_DIGITAL',
      label: 'Physical → digital distribution',
      items: [
        'smart packaging',
        'QR/NFC-connected product experiences where implemented',
        'CNET/display/device network where implemented',
      ],
      epistemicStatus: 'DISTRIBUTION_ARCHITECTURE' as EpistemicStatus,
    },
    {
      id: 'OPPORTUNITY_DRIVEN',
      label: 'Opportunity-driven acquisition',
      items: [
        'Business A WANTS distribution → Cardbey discovers compatible Business B → B has reason to enter/claim/engage because a relevant opportunity exists',
        'Connects to HAS ↔ WANTS and Resource Aggregation Accelerator thesis',
      ],
      epistemicStatus: 'VALIDATING' as EpistemicStatus,
    },
  ],
});

export const INVESTOR_QUESTION_CATEGORIES = Object.freeze([
  'THESIS',
  'MARKET',
  'PRODUCT',
  'TRACTION',
  'USER_ACQUISITION',
  'BUSINESS_MODEL',
  'COMPETITION',
  'DEFENSIBILITY',
  'TEAM',
  'FINANCIAL',
  'LEGAL',
  'ROUND',
  'SCALABILITY',
  'RISK',
  'EXIT',
] as const);

export type InvestorQuestionAnswerState = 'ANSWERED' | 'PARTIAL' | 'EVIDENCE_NEEDED' | 'NOT_YET_APPLICABLE';

export type InvestorQuestionRecord = {
  id: string;
  category: (typeof INVESTOR_QUESTION_CATEGORIES)[number];
  question: string;
  answerState: InvestorQuestionAnswerState;
  answerDraft?: string | null;
  evidenceNeeded?: string | null;
  epistemicStatus?: EpistemicStatus;
  createdAt: string;
  updatedAt: string;
};

/** Seed starter questions — all EVIDENCE_NEEDED or NOT_YET_APPLICABLE; never fabricated ANSWERED. */
export function seedInvestorQuestionBank(): InvestorQuestionRecord[] {
  const now = new Date().toISOString();
  const q = (
    category: InvestorQuestionRecord['category'],
    question: string,
    answerState: InvestorQuestionAnswerState,
    evidenceNeeded?: string,
  ): InvestorQuestionRecord => ({
    id: `iq_${category.toLowerCase()}_${Math.random().toString(36).slice(2, 8)}`,
    category,
    question,
    answerState,
    answerDraft: null,
    evidenceNeeded: evidenceNeeded ?? null,
    epistemicStatus: answerState === 'EVIDENCE_NEEDED' ? 'UNKNOWN' : 'DIRECTION',
    createdAt: now,
    updatedAt: now,
  });

  return [
    q('THESIS', 'What is Cardbey’s core mechanism in one sentence?', 'PARTIAL', 'Confirm USP wording with founder'),
    q('MARKET', 'Which market segment is primary for Seed deployment?', 'EVIDENCE_NEEDED', 'Clarify beachhead market evidence'),
    q('PRODUCT', 'What is live vs roadmap today?', 'EVIDENCE_NEEDED', 'Product capability inventory'),
    q('TRACTION', 'What traction metrics can be shared?', 'EVIDENCE_NEEDED', 'Do not invent revenue/GMV/users'),
    q('USER_ACQUISITION', 'How do users/businesses acquire Cardbey?', 'PARTIAL', 'Acquisition thesis channels — keep as HYPOTHESIS/VALIDATING'),
    q('BUSINESS_MODEL', 'How does Cardbey make money?', 'EVIDENCE_NEEDED', 'Monetization evidence'),
    q('COMPETITION', 'Who are the nearest alternatives?', 'EVIDENCE_NEEDED'),
    q('DEFENSIBILITY', 'What compounds over time?', 'PARTIAL', 'Resource Aggregation Accelerator narrative'),
    q('TEAM', 'Who is building this?', 'EVIDENCE_NEEDED', 'Founder/team pack'),
    q('FINANCIAL', 'What is the A$3M use of funds?', 'PARTIAL', 'Proposed terms only'),
    q('LEGAL', 'Entity / SAFE readiness?', 'EVIDENCE_NEEDED', 'LEGAL_REVIEW_REQUIRED'),
    {
      ...q('ROUND', 'Why Seed at A$3M now?', 'PARTIAL', 'Keep PROPOSED — not verified'),
      epistemicStatus: 'PROPOSED' as EpistemicStatus,
    },
    q('SCALABILITY', 'How does matching scale across domains?', 'PARTIAL'),
    q('RISK', 'What are the top risks?', 'EVIDENCE_NEEDED'),
    q('EXIT', 'What exit paths are plausible?', 'NOT_YET_APPLICABLE'),
  ];
}

export type OperatorAction =
  | 'RESEARCH_MORE'
  | 'REVIEW'
  | 'READY_FOR_ADMISSION'
  | 'HOLD'
  | 'DO_NOT_PRIORITIZE';

export function recommendOperatorAction(row: {
  reciprocalBand: string;
  capitalBand: string;
  investorType: string;
  openGaps: number;
  contradictions: number;
}): OperatorAction {
  if (row.contradictions > 0 || row.capitalBand === 'INCOMPATIBLE' || row.reciprocalBand === 'CONTRADICTED') {
    return 'DO_NOT_PRIORITIZE';
  }
  if (row.investorType === 'ACCELERATOR' || row.investorType === 'STRATEGIC') {
    return row.openGaps > 0 ? 'RESEARCH_MORE' : 'HOLD';
  }
  if (row.openGaps >= 2 || row.capitalBand === 'INSUFFICIENT_EVIDENCE') {
    return 'RESEARCH_MORE';
  }
  if (row.capitalBand === 'QUALIFIED' && ['STRONG_RECIPROCAL', 'ONE_WAY_STRONG'].includes(row.reciprocalBand)) {
    return 'READY_FOR_ADMISSION';
  }
  if (['PARTIAL', 'REVIEW_REQUIRED'].includes(row.capitalBand)) {
    return row.openGaps > 0 ? 'RESEARCH_MORE' : 'REVIEW';
  }
  return 'REVIEW';
}
