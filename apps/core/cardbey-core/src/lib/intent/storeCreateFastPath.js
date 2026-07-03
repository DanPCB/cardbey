import { isDecisionLoopEnabled } from '../../config/features.js';

/**
 * Deterministic store-creation intent detection — runs before LLM classification
 * and blocks service_request misroutes for store setup phrases.
 */

import {
  classifyStoreWebsiteCreateIntent,
  messageLooksLikeStoreCreate,
  messageLooksLikeWebsiteCreate,
} from '../intake/storeWebsiteRunwayClassifier.js';
import { isCasualChatTurn } from '../intake/intakeCasualChatTurn.js';

/** @typedef {'store'|'website'} CreateRunwayMode */

const EXACT_STORE_PHRASES = [
  'create a store',
  'create store',
  'new store',
  'start business',
  'start a business',
  'open shop',
  'open a shop',
  'build store',
  'build a store',
  'make store',
  'make a store',
  'create a store for my business',
  'set up a store',
  'set up my store',
];

const EXACT_WEBSITE_PHRASES = [
  'create a mini website for my business',
  'create a mini website for my store',
  'create mini website',
  'create a website for my business',
  'create a website for my store',
];

/**
 * Structured form submit: "Melbourne Flower · Other · Melbourne"
 * or "Create store: Name · Category · Location"
 *
 * @param {string} message
 * @returns {{ storeName: string | null, category: string | null, location: string | null, intentMode: CreateRunwayMode | null } | null}
 */
export function parseStructuredStoreCreatePillMessage(message) {
  const raw = String(message ?? '').trim();
  if (!raw || !raw.includes('·')) return null;

  let body = raw;
  const prefixMatch = raw.match(/^(create\s+(?:mini\s+website|store):\s*)/i);
  if (prefixMatch) {
    body = raw.slice(prefixMatch[0].length).trim();
  }

  const parts = body.split('·').map((s) => String(s ?? '').trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const typeRaw = (parts[1] ?? '').toLowerCase().replace(/\s+/g, ' ');
  let intentMode = null;
  if (typeRaw.includes('mini') && typeRaw.includes('website')) intentMode = 'website';
  else if (/\bwebsite\b|\bmicrosite\b|\bweb\s*site\b/i.test(parts[1] ?? '')) intentMode = 'website';
  else if (/\bstore\b|\bshop\b/i.test(parts[1] ?? '')) intentMode = 'store';

  if (parts.length >= 3 && !intentMode) {
    return {
      storeName: parts[0] || null,
      category: parts[1] || null,
      location: parts[2] || null,
      intentMode: 'store',
    };
  }

  return {
    storeName: parts[0] || null,
    intentMode,
    category: parts[2] ? parts[2] : parts[1] && !intentMode ? parts[1] : null,
    location: parts[3] ? parts[3] : parts[2] && intentMode ? parts[2] : null,
  };
}

/**
 * @param {string} message
 */
export function isStructuredStoreCreatePillMessage(message) {
  const pill = parseStructuredStoreCreatePillMessage(message);
  if (!pill?.storeName || String(pill.storeName).trim().length < 2) return false;
  return Boolean(pill.category || pill.location || pill.intentMode);
}

/**
 * @param {string} text
 */
function normalizeExactPhrase(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '');
}

/**
 * @param {string} userMessage
 */
export function matchExactStoreCreatePhrase(userMessage) {
  const normalized = normalizeExactPhrase(userMessage);
  if (!normalized) return null;

  for (const phrase of EXACT_STORE_PHRASES) {
    if (normalized === phrase || normalized.includes(phrase)) {
      return { intentMode: /** @type {CreateRunwayMode} */ ('store'), phrase };
    }
  }

  for (const phrase of EXACT_WEBSITE_PHRASES) {
    if (normalized === phrase || normalized.includes(phrase)) {
      return { intentMode: /** @type {CreateRunwayMode} */ ('website'), phrase };
    }
  }

  return null;
}

/**
 * @param {object} [opts]
 * @param {object} [opts.storeCreateForm]
 * @param {string} [opts.forceIntent]
 * @param {string} [opts.currentFlow]
 * @param {string} [opts.source]
 * @param {string|null} [opts.activeStoreId]
 */
export function shouldBlockServiceRequestForStoreCreate(userMessage, opts = {}) {
  const msg = String(userMessage ?? '').trim();
  if (!msg) return false;

  const form = opts.storeCreateForm;
  if (form && typeof form === 'object' && String(form.storeName ?? '').trim().length >= 2) {
    return true;
  }

  const forceIntent = String(opts.forceIntent ?? '').trim().toLowerCase();
  if (forceIntent === 'store_creation' || forceIntent === 'create_store') return true;

  const flow = String(opts.currentFlow ?? '').trim().toLowerCase();
  if (flow === 'store_creation' || flow === 'store_setup') return true;

  const source = String(opts.source ?? '').trim().toLowerCase();
  if (source === 'create_store_button' || source === 'create_store_pill') return true;

  if (isStructuredStoreCreatePillMessage(msg)) return true;
  if (matchExactStoreCreatePhrase(msg)) return true;
  if (messageLooksLikeStoreCreate(msg) || messageLooksLikeWebsiteCreate(msg)) return true;

  const runway = classifyStoreWebsiteCreateIntent(msg);
  if (!runway.ambiguous && runway.intentMode && !opts.activeStoreId) return true;

  return false;
}

/**
 * Deterministic create_store classification before LLM / service_request override.
 *
 * @param {string} userMessage
 * @param {object} [opts]
 * @param {object} [opts.storeCreateForm]
 * @param {string} [opts.forceIntent]
 * @param {string} [opts.currentFlow]
 * @param {string} [opts.source]
 * @param {string|null} [opts.activeStoreId]
 * @returns {object|null}
 */
export function tryStoreCreateFastPath(userMessage, opts = {}) {
  if (isDecisionLoopEnabled() && !opts.allowInDecisionLoop) {
    return null;
  }

  const msg = String(userMessage ?? '').trim();
  if (!msg && !opts.storeCreateForm) return null;

  const form = opts.storeCreateForm;
  if (form && typeof form === 'object') {
    const storeName = String(form.storeName ?? '').trim();
    if (storeName.length >= 2) {
      const intentMode = String(form.intentMode ?? '').trim().toLowerCase() === 'website' ? 'website' : 'store';
      return buildCreateStoreClassification({
        intentMode,
        storeName,
        storeType: form.storeType ?? form.category ?? form.businessType,
        location: form.location,
        reason: 'store_create_form',
        confidence: 1,
      });
    }
  }

  const forceIntent = String(opts.forceIntent ?? '').trim().toLowerCase();
  if (forceIntent === 'store_creation' || forceIntent === 'create_store') {
    return buildCreateStoreClassification({
      intentMode: 'store',
      reason: 'force_intent',
      confidence: 1,
    });
  }

  const flow = String(opts.currentFlow ?? '').trim().toLowerCase();
  const source = String(opts.source ?? '').trim().toLowerCase();
  if (flow === 'store_creation' || source === 'create_store_button' || source === 'create_store_pill') {
    return buildCreateStoreClassification({
      intentMode: 'store',
      reason: 'context_flow',
      confidence: 1,
    });
  }

  const pill = parseStructuredStoreCreatePillMessage(msg);
  if (pill?.storeName && String(pill.storeName).trim().length >= 2) {
    return buildCreateStoreClassification({
      intentMode: pill.intentMode === 'website' ? 'website' : 'store',
      storeName: pill.storeName,
      storeType: pill.category,
      location: pill.location,
      reason: 'structured_pill_message',
      confidence: 1,
    });
  }

  const exact = matchExactStoreCreatePhrase(msg);
  if (exact) {
    return buildCreateStoreClassification({
      intentMode: exact.intentMode,
      reason: `exact_match:${exact.phrase}`,
      confidence: 1,
    });
  }

  if (opts.activeStoreId) return null;

  const runway = classifyStoreWebsiteCreateIntent(msg);
  if (!runway.ambiguous && runway.intentMode) {
    return buildCreateStoreClassification({
      intentMode: runway.intentMode,
      reason: 'runway_classifier',
      confidence: 0.95,
      intentLabel: runway.label ?? undefined,
    });
  }

  return null;
}

/**
 * @param {object} input
 */
function buildCreateStoreClassification(input) {
  const intentMode = input.intentMode === 'website' ? 'website' : 'store';
  const parameters = {
    intentMode,
    _autoSubmit: true,
  };

  if (input.storeName) parameters.storeName = String(input.storeName).trim();
  if (input.storeType) parameters.storeType = String(input.storeType).trim();
  if (input.location) parameters.location = String(input.location).trim();
  if (input.intentLabel) parameters.intentLabel = input.intentLabel;

  return {
    executionPath: 'proactive_plan',
    tool: 'create_store',
    confidence: input.confidence ?? 1,
    parameters,
    _fastPath: 'store_create',
    _reasoning: input.reason ?? 'store_create_fast_path',
  };
}

/**
 * Store / mini-website creation shortcuts stay on the canonical runway under kernel mandatory.
 *
 * @param {{ type?: string } | null | undefined} shortcut
 * @param {{ userMessage?: string, storeCreateForm?: object, primaryMode?: string, intentSource?: string }} [ctx]
 */
export function shouldPreserveCreateStoreShortcutWhenKernelMandatory(shortcut, ctx = {}) {
  if (shortcut?.type === 'create_store') return true;

  const recovered = resolveCreateStoreShortcut({
    userMessage: ctx.userMessage,
    storeCreateForm: ctx.storeCreateForm,
    primaryMode: ctx.primaryMode,
    intentSource: ctx.intentSource,
  });
  return recovered?.type === 'create_store';
}

/**
 * Resolve create_store shortcut even when detectIntent returned null (form-only submit).
 *
 * @param {{ userMessage?: string, storeCreateForm?: object, primaryMode?: string, intentSource?: string }} input
 */
export function resolveCreateStoreShortcut(input = {}) {
  const form = input.storeCreateForm;
  if (form && typeof form === 'object' && String(form.storeName ?? '').trim().length >= 2) {
    const intentMode = String(form.intentMode ?? '').trim().toLowerCase() === 'website' ? 'website' : 'store';
    return { type: 'create_store', intentMode };
  }

  const fast = tryStoreCreateFastPath(String(input.userMessage ?? ''), {
    storeCreateForm: form,
    forceIntent: input.forceIntent,
    currentFlow: input.currentFlow,
    source: input.intentSource,
  });

  if (fast?.tool === 'create_store') {
    return {
      type: 'create_store',
      intentMode: fast.parameters?.intentMode === 'website' ? 'website' : 'store',
      intentLabel: fast.parameters?.intentLabel,
    };
  }

  const primaryMode = String(input.primaryMode ?? '').trim().toLowerCase();
  if (primaryMode === 'create' || primaryMode === 'store_setup' || primaryMode === 'website') {
    if (isCasualChatTurn(String(input.userMessage ?? ''))) {
      return null;
    }
    const runway = classifyStoreWebsiteCreateIntent(String(input.userMessage ?? ''));
    if (!runway.ambiguous && runway.intentMode) {
      return {
        type: 'create_store',
        intentMode: runway.intentMode,
        ...(runway.label ? { intentLabel: runway.label } : {}),
      };
    }
  }

  return null;
}
