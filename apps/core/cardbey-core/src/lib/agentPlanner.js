/**
 * Agent Planner v1 - deterministic intent → mission creation plan.
 * Does not execute tools; produces missionPlan for POST /api/missions.
 * No LLM; intent normalized and matched against a small set.
 *
 * **Boundary:** This is the missions API planner, not Performer Intake V2. Phrase overlap with
 * `intakeStoreSetupHeuristics.js` / Intake V2 is expected; do not delete keywords here without
 * verifying POST /api/missions clients. Full dedup with Intake is deferred (see docs/INTAKE_V2_PLANNER_BOUNDARY.md).
 */

/**
 * Normalize intent: lowercase, trim, collapse spaces.
 * @param {string} raw
 * @returns {string}
 */
function normalizeIntent(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Fuzzy/keyword matching for natural language intents. First match wins (order matters for overlap). */
// First-hop store creation phrases removed in Phase 5C.
// intakeClassifier.js owns first-hop classification.
// agentPlanner owns multi-step planning only.
const INTENT_KEYWORDS = {
  // NOTE: Order matters. Keep create_store ahead of launch_campaign to avoid overlap.
  create_store: [
    // Explicit store creation (regression: "create a store for X" should still match).
    'create a store',
    'create store',
    'create my store',
    'create a store for',
    'make a store',
    'make a store for',
    'build a store',
    'build store',
    'open store',
    'new store',
    // Website/mini-website phrasing aliases for create_store (requested).
    'create a website',
    'create my website',
    'create a mini website',
    'build a website',
    'build me a website',
    'make a website',
    'create a web presence',
    'create a site',
    // Common "from card" phrasing seen in intake.
    'create a website from card',
    'website from card',
  ],
  code_fix: [
    'fix bug',
    'fix issue',
    'debug',
    'code fix',
    'fix this bug',
    'something is broken',
    'hero image not',
    'not working',
    'broken feature',
    'fix the',
    'identify why',
    'propose a fix',
    'patch for',
  ],
  launch_campaign: [
    'launch campaign', 'launch a campaign', 'marketing campaign', 'create campaign', 'start campaign',
    'run campaign', 'launch a marketing campaign', 'create a promotion',
  ],
  generate_social: ['social content', 'social media', 'generate posts', 'social posts', 'content for social'],
  rewrite_descriptions: [
    'rewrite descriptions', 'rewrite', 'improve descriptions', 'better descriptions', 'update descriptions',
    'rewrite my descriptions',
  ],
  generate_tags: ['generate tags', 'add tags', 'create tags', 'tag products'],
  improve_hero: ['improve hero', 'change hero', 'update hero', 'hero image'],
  create_offer: ['create offer', 'create promotion', 'new offer', 'launch promotion', 'make a deal'],
  analyze_store: ['analyze', 'analyse', 'performance', 'analyze store', 'store performance', 'how is my store'],
  review_categories: ['review categories', 'fix categories', 'update categories'],
};

/**
 * Match intent from natural language using keyword inclusion. Returns intentType or null.
 * @param {string} input - normalized intent string
 * @returns {string | null}
 */
function matchIntent(input) {
  const lower = input.toLowerCase().trim();
  for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return intentType;
  }
  return null;
}

/**
 * Personal profile / digital card intake (guest-allowed; no storeId required).
 * Checked before generic store keywords so we never return missionType "store" for these phrases.
 */
const PERSONAL_PROFILE_PHRASES = [
  'set up my personal profile',
  'create my personal profile',
  'create personal profile',
  'build my personal profile',
  'my personal page',
  'my digital card',
  'my profile card',
  'personal profile card',
  'digital profile card',
  'personal presence',
  'refine (profile):',
];

/** Intent phrases that map to store_improvement (first match wins). */
const STORE_IMPROVEMENT_PHRASES = ['improve this store', 'improve my store'];

/** Intent phrases that map to store_publish_preparation. */
const STORE_PUBLISH_PHRASES = ['prepare this store for publish'];

/** Intent phrases that map to generate_tags (single-step). */
const GENERATE_TAGS_PHRASES = ['generate tags'];

/** Intent phrases that map to rewrite_descriptions (single-step). */
const REWRITE_DESCRIPTIONS_PHRASES = ['rewrite descriptions'];

/** Intent phrases that map to improve_hero (single-step). */
const IMPROVE_HERO_PHRASES = ['improve hero'];

/** Promotion intents (require promotionId; storeId for store/screen slots). */
const SHOW_PROMO_ON_STORE_PHRASES = ['show this promo on my store', 'show this promotion on my store'];
const FEATURE_ON_HOMEPAGE_PHRASES = ['feature this on homepage', 'feature this on home page'];
const PUSH_TO_SCREENS_PHRASES = ['push this to screens', 'push this to screen'];

/**
 * Check if normalized intent matches any of the phrases.
 * @param {string} normalized
 * @param {string[]} phrases
 * @returns {boolean}
 */
function matches(normalized, phrases) {
  return phrases.some((p) => normalized === p || normalized.includes(p));
}

/**
 * Plan a mission from user intent and context.
 *
 * @param {{
 *   intent: string;
 *   context?: { storeId?: string; draftId?: string; missionId?: string; pageMode?: string; pathname?: string };
 * }} input
 * @returns {Promise<{
 *   ok: boolean;
 *   missionPlan?: {
 *     missionType: string;
 *     title: string;
 *     targetType: string;
 *     targetId?: string;
 *     targetLabel?: string;
 *     requiresConfirmation?: boolean;
 *     metadata?: object;
 *   };
 *   reason?: string;
 * }>}
 */
export function planMissionFromIntent(input) {
  const intent = normalizeIntent(input?.intent ?? '');
  const ctx = input?.context && typeof input.context === 'object' ? input.context : {};
  const storeId = typeof ctx.storeId === 'string' ? ctx.storeId.trim() : undefined;
  const promotionId = typeof ctx.promotionId === 'string' ? ctx.promotionId.trim() : undefined;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[AgentPlanner] intent received: ${intent || '(empty)'}`);
  }

  const storeRelated = (missionType, title, requiresConfirmation = false) => {
    if (!storeId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AgentPlanner] unsupported intent (missing store): ${intent}`);
      }
      return { ok: false, reason: 'MISSING_STORE_CONTEXT' };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AgentPlanner] plan created: ${missionType}`);
    }
    return {
      ok: true,
      missionPlan: {
        missionType,
        title,
        targetType: 'store',
        targetId: storeId,
        targetLabel: undefined,
        requiresConfirmation,
        metadata: {},
      },
    };
  };

  /** Promotion intents: require promotionId; optional storeId for store/screen slots. */
  const promotionSlotAssignment = (title, slotKey, requireStoreId = false) => {
    if (!promotionId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AgentPlanner] promotion intent missing promotionId: ${intent}`);
      }
      return { ok: false, reason: 'MISSING_PROMOTION_CONTEXT' };
    }
    if (requireStoreId && !storeId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AgentPlanner] promotion intent missing storeId: ${intent}`);
      }
      return { ok: false, reason: 'MISSING_STORE_CONTEXT' };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AgentPlanner] promotion mission plan created: promotion_slot_assignment`);
    }
    const metadata = { slotKey, promotionId };
    if (storeId) metadata.storeId = storeId;
    return {
      ok: true,
      missionPlan: {
        missionType: 'promotion_slot_assignment',
        title,
        targetType: 'promotion',
        targetId: promotionId,
        targetLabel: undefined,
        requiresConfirmation: false,
        metadata,
      },
    };
  };

  const screenContentDeployment = (title, slotKey) => {
    if (!promotionId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AgentPlanner] screen deployment missing promotionId: ${intent}`);
      }
      return { ok: false, reason: 'MISSING_PROMOTION_CONTEXT' };
    }
    if (!storeId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AgentPlanner] screen deployment missing storeId: ${intent}`);
      }
      return { ok: false, reason: 'MISSING_STORE_CONTEXT' };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AgentPlanner] promotion mission plan created: screen_content_deployment`);
    }
    return {
      ok: true,
      missionPlan: {
        missionType: 'screen_content_deployment',
        title,
        targetType: 'promotion',
        targetId: promotionId,
        targetLabel: undefined,
        requiresConfirmation: false,
        metadata: { slotKey: slotKey || 'cnet_main_screen', promotionId, storeId },
      },
    };
  };

  if (!intent) {
    return { ok: false, reason: 'UNSUPPORTED_INTENT' };
  }

  if (matches(intent, PERSONAL_PROFILE_PHRASES)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AgentPlanner] plan created: create_personal_profile (guest-allowed)');
    }
    return {
      ok: true,
      missionPlan: {
        missionType: 'create_personal_profile',
        title: 'Create personal profile',
        targetType: 'store',
        targetId: undefined,
        targetLabel: undefined,
        requiresConfirmation: true,
        metadata: { orchestraGoal: 'create_personal_profile' },
      },
    };
  }

  const keywordMatched = matchIntent(intent);
  if (keywordMatched) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AgentPlanner] intent matched: ${keywordMatched}`);
    }
    if (keywordMatched === 'create_store') {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[AgentPlanner] plan created: create_store (no store context required)');
      }
      return {
        ok: true,
        intentType: 'create_store',
        title: 'Create store',
        requiresConfirmation: true,
        missionPlan: {
          missionType: 'create_store',
          title: 'Create store',
          targetType: 'generic',
          targetId: null,
          requiresConfirmation: true,
          metadata: {},
        },
      };
    }
    if (keywordMatched === 'code_fix') {
      return {
        ok: true,
        intentType: 'code_fix',
        title: 'Fix code issue',
        requiresConfirmation: true,
        missionPlan: {
          missionType: 'code_fix',
          title: 'Fix code issue',
          targetType: 'generic',
          targetId: null,
          requiresConfirmation: true,
          metadata: {},
        },
      };
    }
    if (keywordMatched === 'launch_campaign') return storeRelated('launch_campaign', 'Launch campaign');
    if (keywordMatched === 'generate_social') return storeRelated('generate_social', 'Generate social content');
    if (keywordMatched === 'rewrite_descriptions') return storeRelated('rewrite_descriptions', 'Rewrite descriptions');
    if (keywordMatched === 'generate_tags') return storeRelated('generate_tags', 'Generate product tags');
    if (keywordMatched === 'improve_hero') return storeRelated('improve_hero', 'Improve hero');
    if (keywordMatched === 'create_offer') return storeRelated('create_offer', 'Create offer');
    if (keywordMatched === 'analyze_store') return storeRelated('analyze_store', 'Analyze store');
    if (keywordMatched === 'review_categories') return storeRelated('review_categories', 'Review categories');
  }

  if (matches(intent, STORE_IMPROVEMENT_PHRASES)) {
    return storeRelated('store_improvement', 'Improve store');
  }
  if (matches(intent, STORE_PUBLISH_PHRASES)) {
    return storeRelated('store_publish_preparation', 'Prepare store for publish');
  }
  if (matches(intent, GENERATE_TAGS_PHRASES)) {
    return storeRelated('generate_tags', 'Generate product tags');
  }
  if (matches(intent, REWRITE_DESCRIPTIONS_PHRASES)) {
    return storeRelated('rewrite_descriptions', 'Rewrite descriptions');
  }
  if (matches(intent, IMPROVE_HERO_PHRASES)) {
    return storeRelated('improve_hero', 'Improve hero');
  }

  if (matches(intent, SHOW_PROMO_ON_STORE_PHRASES)) {
    if (process.env.NODE_ENV !== 'production') console.log(`[AgentPlanner] promotion intent received: ${intent}`);
    return promotionSlotAssignment('Show promo on store', 'store_entry_popup', true);
  }
  if (matches(intent, FEATURE_ON_HOMEPAGE_PHRASES)) {
    if (process.env.NODE_ENV !== 'production') console.log(`[AgentPlanner] promotion intent received: ${intent}`);
    return promotionSlotAssignment('Feature on homepage', 'homepage_hero', false);
  }
  if (matches(intent, PUSH_TO_SCREENS_PHRASES)) {
    if (process.env.NODE_ENV !== 'production') console.log(`[AgentPlanner] promotion intent received: ${intent}`);
    return screenContentDeployment('Push to screens', 'cnet_main_screen');
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[AgentPlanner] no intent match, fallback to assistant_chat: ${intent}`);
  }
  const rawIntent = typeof input?.intent === 'string' ? input.intent.trim() : intent;
  return {
    ok: true,
    intentType: 'assistant_chat',
    title: rawIntent || 'Chat',
    requiresConfirmation: false,
    missionPlan: {
      missionType: 'assistant_chat',
      title: rawIntent || 'Chat',
      targetType: 'generic',
      targetId: undefined,
      targetLabel: undefined,
      requiresConfirmation: false,
      metadata: {},
    },
  };
}
