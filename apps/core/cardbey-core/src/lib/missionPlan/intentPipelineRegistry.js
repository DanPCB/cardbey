/**
 * Intent pipeline registry: per–intent-type steps, checkpoints, summary key, and optional executor path.
 * Keys = backend mission.type (e.g. rewrite_descriptions, promotion_slot_assignment).
 */

const INTENT_PIPELINES = {
  store: {
    steps: ['validate-context', 'execute-tasks', 'report'],
    checkpoints: ['Understanding your business', 'Building your store', 'Preparing your preview'],
    summaryKey: 'store_ready',
  },
  rewrite_descriptions: {
    steps: ['analyse-store', 'rewrite-copy', 'report'],
    stepToolNames: ['analyze_store', 'rewrite_descriptions'],
    checkpoints: ['Analysing your products', 'Rewriting descriptions', 'Done'],
    summaryKey: 'descriptions_ready',
    executorPath: 'store/rewrite_descriptions',
  },
  generate_tags: {
    steps: ['analyse-store', 'generate-tags', 'report'],
    stepToolNames: ['analyze_store', 'generate_tags'],
    checkpoints: ['Analysing your products', 'Generating tags', 'Done'],
    summaryKey: 'tags_ready',
    executorPath: 'store/generate_tags',
  },
  improve_hero: {
    steps: ['analyse-store', 'update-hero', 'report'],
    stepToolNames: ['analyze_store', 'improve_hero'],
    checkpoints: ['Analysing your store', 'Updating hero image', 'Done'],
    summaryKey: 'hero_updated',
    executorPath: 'store/improve_hero',
  },
  store_improvement: {
    steps: ['analyse-store', 'improve-tasks', 'report'],
    stepToolNames: ['analyze_store', 'generate_tags', 'rewrite_descriptions', 'improve_hero'],
    checkpoints: ['Analysing your store', 'Improving products and hero', 'Done'],
    summaryKey: 'task_complete',
  },
  store_publish_preparation: {
    steps: ['analyse-store', 'prepare-tasks', 'report'],
    stepToolNames: ['analyze_store', 'generate_tags', 'rewrite_descriptions'],
    checkpoints: ['Analysing your store', 'Preparing for publish', 'Done'],
    summaryKey: 'task_complete',
  },
  promotion_launch: {
    steps: ['validate-store', 'create-promotion', 'report'],
    stepToolNames: ['create_promotion', 'generate_promotion_asset', 'assign_promotion_slot', 'activate_promotion'],
    checkpoints: ['Checking your store', 'Creating promotion', 'Assigning and activating', 'Done'],
    summaryKey: 'promotion_ready',
    executorPath: 'promotion/create_promotion',
  },
  promotion_slot_assignment: {
    steps: ['validate-promo', 'assign-slot', 'report'],
    stepToolNames: ['assign_promotion_slot', 'activate_promotion'],
    checkpoints: ['Finding your promotion', 'Showing on store', 'Done'],
    summaryKey: 'promo_shown',
    executorPath: 'promotion/assign_promotion_slot',
  },
  screen_content_deployment: {
    steps: ['resolve-screens', 'prepare-asset', 'assign-activate', 'report'],
    stepToolNames: ['resolve_target_screens', 'prepare_screen_asset', 'assign_screen_slot', 'activate_screen_content'],
    checkpoints: ['Resolving target screens', 'Preparing asset', 'Assigning and activating', 'Done'],
    summaryKey: 'task_complete',
  },
  create_promotion: {
    steps: ['validate-store', 'create-promotion', 'report'],
    stepToolNames: ['create_promotion'],
    checkpoints: ['Checking your store', 'Creating your promotion', 'Done'],
    summaryKey: 'promotion_ready',
    executorPath: 'promotion/create_promotion',
  },
  show_promo_on_store: {
    steps: ['validate-promo', 'assign-slot', 'report'],
    stepToolNames: ['assign_promotion_slot'],
    checkpoints: ['Finding your promotion', 'Showing on store', 'Done'],
    summaryKey: 'promo_shown',
    executorPath: 'promotion/assign_promotion_slot',
  },
  generate_social_posts: {
    steps: ['analyse-store', 'generate-content', 'report'],
    stepToolNames: ['analyze_store', 'generate_social_posts'],
    checkpoints: ['Analysing your store', 'Generating posts', 'Done'],
    summaryKey: 'content_ready',
    executorPath: 'content/generate_social_posts',
  },
  review_categories: {
    steps: ['analyse-categories', 'suggest-improvements', 'report'],
    stepToolNames: [],
    checkpoints: ['Reviewing categories', 'Suggesting improvements', 'Done'],
    summaryKey: 'categories_reviewed',
    executorPath: 'store/review_categories',
  },
  create_offer: {
    steps: ['validate-store', 'create-offer', 'activate', 'report'],
    stepToolNames: ['analyze_store', 'create_offer', 'assign_promotion_slot'],
    checkpoints: ['Checking your store', 'Creating your offer', 'Activating promotion', 'Done'],
    summaryKey: 'offer_ready',
    executorPath: 'promotion/create_offer',
  },
  /** Non-production smoke: single MCP-backed read-only step (explicit type only; not used in store/publish flows). */
  mcp_context_smoke: {
    steps: ['mcp-context-products'],
    stepToolNames: ['mcp_context_products'],
    checkpoints: ['Load product context (MCP)'],
    summaryKey: 'mcp_context_ok',
  },
  /** Isolated smoke: MCP business context only (explicit type; not used in store/publish flows). */
  mcp_business_smoke: {
    steps: ['mcp-context-business'],
    stepToolNames: ['mcp_context_business'],
    checkpoints: ['Load business context (MCP)'],
    summaryKey: 'mcp_business_ok',
  },
  /** Isolated smoke: MCP store assets / branding context only (explicit type; not used in store/publish flows). */
  mcp_store_assets_smoke: {
    steps: ['mcp-context-store-assets'],
    stepToolNames: ['mcp_context_store_assets'],
    checkpoints: ['Load store assets context (MCP)'],
    summaryKey: 'mcp_store_assets_ok',
  },
  default: {
    steps: ['validate-context', 'execute-tasks', 'report'],
    checkpoints: ['Understanding your business', 'Running tasks', 'Done'],
    summaryKey: 'task_complete',
  },
  /**
   * Personal profile card (Performer): same step shape as {@link INTENT_PIPELINES.store};
   * execution uses orchestra entryPoint build_store + goal build_personal_presence | create_personal_profile.
   */
  build_personal_presence: {
    steps: ['validate-context', 'execute-tasks', 'report'],
    checkpoints: ['Understanding your profile', 'Building your profile card', 'Preparing your preview'],
    summaryKey: 'personal_profile_ready',
  },
};

// create_personal_profile (mission intent type) → same pipeline record as build_personal_presence
INTENT_PIPELINES.create_personal_profile = INTENT_PIPELINES.build_personal_presence;

// Alias MI-style intent names to existing pipelines.
INTENT_PIPELINES.launch_campaign = {
  steps: ['market-research', 'consensus', 'analyse-store', 'create-promotion', 'activate', 'content', 'crm', 'report'],
  stepToolNames: ['market_research', 'consensus', 'analyze_store', 'create_promotion', 'activate_promotion', 'content_creator', 'crm'],
  checkpoints: ['Research', 'Consensus', 'Analysis', 'Promotion', 'Activation', 'Content', 'CRM'],
  summaryKey: 'campaign_ready',
  executorPath: 'promotion/create_promotion',
};
INTENT_PIPELINES.generate_social = INTENT_PIPELINES.generate_social_posts;

/**
 * Performer / intake metadata (UI, allowlists). Pipelines remain in {@link INTENT_PIPELINES}.
 * @type {ReadonlyArray<{ intentType: string, label: string, pipeline: string, description: string, requiresStore: boolean, guestAllowed: boolean }>}
 */
export const INTENT_INTAKE_REGISTRY = [
  {
    intentType: 'create_personal_profile',
    label: 'Create personal profile',
    pipeline: 'build_personal_presence',
    description: 'Build a personal presence page as a digital profile card',
    requiresStore: false,
    guestAllowed: true,
  },
];

export { INTENT_PIPELINES };

export function getPipelineForIntent(intentType) {
  const key = typeof intentType === 'string' ? intentType.trim() : '';
  return INTENT_PIPELINES[key] ?? INTENT_PIPELINES.default;
}

export function isMiIntent(intentType) {
  return Boolean(getPipelineForIntent(intentType).executorPath);
}

/**
 * When true, POST /api/missions/plan may attach an LLM task graph for eligible intents (see llmTaskPlanner).
 * Registry pipelines remain the source of truth for step tools when the flag is off or the planner fails.
 */
export function useLlmTaskPlannerEnv() {
  return String(process.env.USE_LLM_TASK_PLANNER || '').toLowerCase() === 'true';
}

/** @returns {'llm_when_enabled' | 'registry_only'} */
export function getIntentPlanningMode() {
  return useLlmTaskPlannerEnv() ? 'llm_when_enabled' : 'registry_only';
}

/**
 * When `USE_LLM_TASK_PLANNER=true`, the LLM task planner may run for **any** intent string
 * (no per-type allowlist here). `planTaskGraphForIntent` still falls back to
 * {@link getPipelineForIntent} / registry graph on LLM off, invalid JSON, or validation failure.
 *
 * @param {string | undefined} _intentType — ignored; kept for API stability
 * @returns {boolean}
 */
export function isLlmPlannerEnabledForIntent(_intentType) {
  if (!useLlmTaskPlannerEnv()) return false;
  return true;
}

/**
 * Attach LLM task graph on `/api/missions/plan` when planner env is on and the resolved mission has a type.
 * @param {string | undefined} missionType
 * @returns {boolean}
 */
export function shouldOfferLlmTaskGraph(missionType) {
  const t = String(missionType || '').trim();
  return useLlmTaskPlannerEnv() && Boolean(t);
}
