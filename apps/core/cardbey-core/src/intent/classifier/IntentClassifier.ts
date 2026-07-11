/**
 * Pure intent classification — message content only.
 * No context, routing, or guard patches.
 */

import type { Intent, IntentEngineInput, IntentType } from '../intent.types.js';

const GREETING_RE =
  /^(hi|hello|hey|thanks|thank you|yo|sup|good\s+(morning|afternoon|evening))$/i;

const HELP_RE = /^(help|i need help|support|guide(?:\s+me)?)$/i;

const CAPABILITIES_RE =
  /^(what can you do(?:\s+today)?\??|how (?:do|can) i(?:\s+[^?.!]{0,40})?\??)$/i;

const QUESTION_RE =
  /^(answer a question\.?|\.\.?|what is|what are|how does|why does|can you explain|tell me about)\b/i;

const CREATE_STORE_RE =
  /\b(create|set\s*up|start|open|launch|build|make)\s+(a\s+)?(new\s+)?(store|business|shop)\b/i;

const CREATE_CAMPAIGN_RE =
  /\b(create|set\s*up|start|launch|run|make)\s+(a\s+)?(new\s+)?(campaign|promotion|promo)\b/i;

const ANALYTICS_RE =
  /\b(analytics|reports?|insights?|performance|metrics|dashboard)\b/i;

const CATALOG_RE =
  /\b(catalog|products?|menu|inventory|add\s+products?|manage\s+products?)\b/i;

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
      type === 'analytics' ||
      type === 'manage_catalog');

  return {
    type,
    requiresBusiness,
    confidence: opts.confidence ?? confidenceFor(type, true),
    response: opts.response,
    entities: opts.entities,
    shouldExecute: opts.shouldExecute ?? (requiresBusiness || type === 'question'),
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
  if (action === 'create_store' || formStoreName.length >= 2) {
    return buildIntent('create_store', { confidence: 0.98, shouldExecute: true });
  }

  if (primaryModeHint === 'store_setup' || primaryModeHint === 'store_creation') {
    if (CREATE_STORE_RE.test(msg) || formStoreName.length >= 2) {
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

  if (CAPABILITIES_RE.test(msg)) {
    return buildIntent('capabilities', {
      requiresBusiness: false,
      response:
        'I can help you create and manage businesses, launch campaigns, manage products and catalogs, set up loyalty programs, view analytics, and generate marketing content. What would you like to do?',
      shouldExecute: false,
    });
  }

  if (CREATE_STORE_RE.test(msg)) {
    return buildIntent('create_store', { shouldExecute: true });
  }

  if (CREATE_CAMPAIGN_RE.test(msg)) {
    return buildIntent('create_campaign', { shouldExecute: true });
  }

  if (ANALYTICS_RE.test(msg)) {
    return buildIntent('analytics', { shouldExecute: true });
  }

  if (CATALOG_RE.test(msg)) {
    return buildIntent('manage_catalog', { shouldExecute: true });
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
