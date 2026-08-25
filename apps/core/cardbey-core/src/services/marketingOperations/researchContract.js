/**
 * Curated public-source catalog for Marketing Ops research V1.
 * SOURCE_FACT only. No invented statistics. No live fetch.
 */

export const EVIDENCE_KIND = Object.freeze({
  SOURCE_FACT: 'SOURCE_FACT',
  AI_INTERPRETATION: 'AI_INTERPRETATION',
});

export const RESEARCH_TASK_STATES = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
});

export const OPPORTUNITY_STATES = Object.freeze({
  NEW: 'NEW',
  REVIEWING: 'REVIEWING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
});

export const ACQUISITION_OPPORTUNITY_TYPES = Object.freeze([
  'AUDIENCE',
  'MARKET_TREND',
  'BUSINESS_NEED',
  'PARTNERSHIP',
  'SUPPLIER',
  'GLOBAL_LIVE',
  'CONTENT_TOPIC',
  'COMMUNITY',
  'MARKET_ENTRY',
]);

export const INVESTOR_OPPORTUNITY_TYPES = Object.freeze([
  'INVESTOR_THEME',
  'INVESTOR_ORGANIZATION',
  'ACCELERATOR',
  'FUNDING_PROGRAM',
  'STARTUP_EVENT',
  'STRATEGIC_PARTNERSHIP',
]);

export const PILOT_OBJECTIVE_SEEDS = Object.freeze([
  {
    key: 'vn_sme',
    name: 'Vietnamese SMEs → Cardbey',
    targetType: 'USER_ACQUISITION',
    market: 'vn',
    language: 'vi',
    status: 'ACTIVE',
    goal: 'Find useful reasons for Vietnamese SMEs to try Cardbey.',
    question:
      'What current needs, communities, sectors and market-entry opportunities could give Vietnamese SMEs a useful reason to try Cardbey?',
  },
  {
    key: 'packaging',
    name: 'Smart Packaging Vietnam → Australia',
    targetType: 'USER_ACQUISITION',
    market: 'vn-au',
    language: 'en',
    status: 'ACTIVE',
    goal: 'Support a Cardbey pilot connecting Vietnamese packaging suppliers with the Australian market.',
    question:
      'What opportunities, business needs and audience segments could support a Cardbey pilot connecting Vietnamese packaging suppliers with the Australian market?',
  },
  {
    key: 'investor',
    name: 'Cardbey Global Investor Discovery',
    targetType: 'INVESTOR_DISCOVERY',
    market: 'global',
    language: 'en',
    status: 'ACTIVE',
    goal: 'Research investor themes relevant to Cardbey. Research only — no CRM or outreach.',
    question:
      "What investor themes, organizations, accelerators, programs and startup ecosystems are relevant to Cardbey's current business direction?",
  },
]);
