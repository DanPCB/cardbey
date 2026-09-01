/**
 * Pure intent classification — message content only.
 * No context, routing, or guard patches.
 * Phase 2: attaches unifiedIntent (canonical lib/intent IntentType).
 */

import type { Intent, IntentEngineInput, IntentType } from '../intent.types.js';
import { normalizeCreateStoreTypos } from '../../lib/intent/storeCreateFastPath.js';
import { fromIntentFirstType } from '../../lib/intent/unifiedIntent.ts';

const GREETING_RE =
  /^(hi|hello|hey|thanks|thank you|yo|sup|good\s+(morning|afternoon|evening))$/i;

const HELP_RE = /^(help|i need help|support|guide(?:\s+me)?)$/i;

const CAPABILITIES_RE =
  /^(what can you do(?:\s+today)?\??|how (?:do|can) i(?:\s+[^?.!]{0,40})?\??)$/i;

const QUESTION_RE =
  /^(answer a question\.?|\.\.?|what is|what are|how does|why does|can you explain|tell me about)\b/i;

/** Aligned with storeWebsiteRunwayClassifier STORE_SIGNALS (loose gap between verb and noun). */
const CREATE_STORE_RE =
  /\b(create|set\s*up|start|open|launch|build|make)\b.{0,20}\b(store|business|shop)\b/i;

const CREATE_CAMPAIGN_RE =
  /\b(create|set\s*up|start|launch|run|make)\s+(?:a\s+)?(?:new\s+)?(?:[\w'-]+\s+){0,4}(campaign|promotion|promo)\b/i;

const CREATE_LOYALTY_RE =
  /\b(create|set\s*up|start|launch|make|build)\s+(?:a\s+)?(?:new\s+)?(?:[\w'-]+\s+){0,6}loyalty(?:\s+program)?\b/i;

/** Explicit tool/action keys typed in chat or sent as manual actions. */
const EXPLICIT_TOOL_INTENT: Record<string, IntentType> = {
  create_store: 'create_store',
  create_campaign: 'create_campaign',
  launch_campaign: 'create_campaign',
  get_store_analytics: 'analytics',
  view_analytics: 'analytics',
  replace_store_catalog: 'manage_catalog',
  add_product: 'manage_catalog',
  setup_loyalty_program: 'setup_loyalty',
  setup_loyalty: 'setup_loyalty',
  create_loyalty_program: 'setup_loyalty',
};

function normalizeExplicitToolKey(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function intentFromExplicitToolKey(key: string): Intent | null {
  const normalized = normalizeExplicitToolKey(key);
  const type = EXPLICIT_TOOL_INTENT[normalized];
  if (!type) return null;
  return buildIntent(type, { confidence: 0.98, shouldExecute: true });
}

const ANALYTICS_RE =
  /\b(analytics|reports?|insights?|performance|metrics|dashboard)\b/i;

const CATALOG_RE =
  /\b(catalog|products?|menu|inventory|add\s+products?|manage\s+products?)\b/i;

/** Headline / copy edits — aligned with intakeCapabilityGap SIMPLE_TEXT_OR_COPY_FIX_RE + ontology. */
const CONTENT_EDIT_RE =
  /\b(fix|change|update|replace|correct|edit|rewrite)\b[\s\S]{0,120}\b(headline|title|tagline|subtitle|name|wording|text|spelling|typo|hero)\b/i;

const AMBIGUOUS_RE = /^[\p{L}\p{M}\p{N}'-]+(?:\s+[\p{L}\p{M}\p{N}'-]+){0,4}$/u;

const INTENT_SIGNAL_RE =
  /\b(add|create|upload|publish|launch|start|setup|set\s*up|run|make|build|campaign|product|menu|loyalty|analytics|store|business|promotion|graphic|catalog|order|book|service|website|signage|device|poster|hero|banner|video|scan|import|delete|remove|update|edit|change|show|view|list|find|search|help|new)\b/i;

function confidenceFor(type: IntentType, matched: boolean, strong = false): number {
  if (!matched) return 0;
  if (strong) return 0.95;
  if (type === 'greeting' || type === 'help' || type === 'capabilities') return 0.92;
  if (type === 'clarify') return 0.55;
  return 0.88;
}

function buildIntent(
  type: IntentType,
  opts: { requiresBusiness?: boolean; confidence?: number; response?: string; shouldExecute?: boolean; entities?: Record<string, unknown> },
): Intent {
  const requiresBusiness =
    opts.requiresBusiness ??
    (type === 'create_store' ||
      type === 'create_campaign' ||
      type === 'setup_loyalty' ||
      type === 'analytics' ||
      type === 'manage_catalog' ||
      type === 'content_edit');

  return {
    type,
    requiresBusiness,
    confidence: opts.confidence ?? confidenceFor(type, true),
    response: opts.response,
    entities: opts.entities,
    shouldExecute: opts.shouldExecute ?? (requiresBusiness || type === 'question'),
    unifiedIntent: fromIntentFirstType(type),
  };
}

/**
 * Classify user message into a single intent.
 * Only inspects message text and explicit form/action signals — never store context.
 */
export function classifyIntent(input: IntentEngineInput): Intent {
  const msg = String(input.message ?? '').trim();
  const action = String(input.action ?? '').trim();
  const primaryModeHint = String(input.primaryModeHint ?? '').trim().toLowerCase();
  const storeCreateForm =
    input.storeCreateForm && typeof input.storeCreateForm === 'object' && !Array.isArray(input.storeCreateForm)
      ? input.storeCreateForm
      : null;
  const formStoreName = String(storeCreateForm?.storeName ?? '').trim();

  // Explicit entry points (form submit / action) — not message overrides.
  const explicitFromAction = intentFromExplicitToolKey(action);
  if (explicitFromAction) return explicitFromAction;

  if (action === 'create_store' || formStoreName.length >= 2) {
    return buildIntent('create_store', { confidence: 0.98, shouldExecute: true });
  }

  const storeCreateMsg = normalizeCreateStoreTypos(msg) || msg;

  if (primaryModeHint === 'store_setup' || primaryModeHint === 'store_creation') {
    if (CREATE_STORE_RE.test(storeCreateMsg) || formStoreName.length >= 2) {
      return buildIntent('create_store', { confidence: 0.9, shouldExecute: true });
    }
  }

  if (primaryModeHint === 'campaign' && CREATE_CAMPAIGN_RE.test(msg)) {
    return buildIntent('create_campaign', { confidence: 0.9, shouldExecute: true });
  }

  if (!msg) {
    return buildIntent('clarify', {
      requiresBusiness: false,
      confidence: 0.4,
      response: "I didn't quite catch that. What would you like to do?",
      shouldExecute: false,
    });
  }

  // Attachment placeholders are upload Ask turns — never generic help chat.
  const attachmentPlaceholder =
    /^\(image attached\)$/i.test(msg) ||
    /^\(files attached\)$/i.test(msg) ||
    /^image attached$/i.test(msg) ||
    /^files attached$/i.test(msg);
  if (attachmentPlaceholder) {
    return buildIntent('clarify', {
      requiresBusiness: false,
      confidence: 0.9,
      response:
        'I see your upload. What would you like to do next? You can create a store, import a catalog, or analyze the document.',
      shouldExecute: false,
    });
  }

  const explicitFromMessage = intentFromExplicitToolKey(msg);
  if (explicitFromMessage) return explicitFromMessage;

  if (GREETING_RE.test(msg)) {
    return buildIntent('greeting', {
      requiresBusiness: false,
      response: 'Hello! How can I help you today?',
      shouldExecute: false,
    });
  }

  if (HELP_RE.test(msg)) {
    return buildIntent('help', {
      requiresBusiness: false,
      response:
        "I'm here to help. You can manage campaigns, products, loyalty, analytics, or create a new business. What would you like to do?",
      shouldExecute: false,
    });
  }

  // Create-store before capabilities: "how can I create a store?" is create_store, not a generic capabilities FAQ.
  if (CREATE_STORE_RE.test(storeCreateMsg)) {
    return buildIntent('create_store', { shouldExecute: true });
  }

  if (CAPABILITIES_RE.test(msg)) {
    return buildIntent('capabilities', {
      requiresBusiness: false,
      response:
        'I can help you create and manage businesses, launch campaigns, manage products and catalogs, set up loyalty programs, view analytics, and generate marketing content. What would you like to do?',
      shouldExecute: false,
    });
  }

  if (CREATE_CAMPAIGN_RE.test(msg)) {
    return buildIntent('create_campaign', { shouldExecute: true });
  }

  if (CREATE_LOYALTY_RE.test(msg)) {
    return buildIntent('setup_loyalty', { shouldExecute: true });
  }

  if (ANALYTICS_RE.test(msg)) {
    return buildIntent('analytics', { shouldExecute: true });
  }

  if (CATALOG_RE.test(msg)) {
    return buildIntent('manage_catalog', { shouldExecute: true });
  }

  // Before generic question/chat fallback — restore legacy content_edit → code_fix path.
  if (CONTENT_EDIT_RE.test(msg) && !/\b(image|photo|picture|logo)\b/i.test(msg)) {
    return buildIntent('content_edit', {
      shouldExecute: true,
      confidence: 0.9,
      response: 'Preparing a copy update for your approval.',
    });
  }

  if (QUESTION_RE.test(msg)) {
    return buildIntent('question', {
      requiresBusiness: false,
      response: 'What would you like to know? I can help with your business, campaigns, products, or general questions.',
      shouldExecute: false,
    });
  }

  if (!INTENT_SIGNAL_RE.test(msg) && AMBIGUOUS_RE.test(msg) && msg.length <= 48) {
    return buildIntent('clarify', {
      requiresBusiness: false,
      confidence: 0.55,
      response:
        "I didn't quite catch that. You can ask for help, manage campaigns, add products, or create a new business — what would you like to do?",
      shouldExecute: false,
    });
  }

  return buildIntent('question', {
    requiresBusiness: false,
    confidence: 0.6,
    response: 'How can I help you today?',
    shouldExecute: false,
  });
}

export class IntentClassifier {
  classify(input: IntentEngineInput): Intent {
    return classifyIntent(input);
  }
}
