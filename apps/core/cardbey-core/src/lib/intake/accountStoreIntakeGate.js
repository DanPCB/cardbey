/**
 * Phase 1 — distinguish account-owned stores from active session store context.
 */

import { detectExplicitStoreIntent } from './assetUploadGuard.js';
import { isCasualChatTurn } from './intakeCasualChatTurn.js';
import { fetchUserStoresForDisambiguation } from './resolveStoreAmbiguity.js';
import { buildExecutionContextClarifyPayload } from '../mission/resolveExecutionContext.js';

const EXPLICIT_NEW_BUSINESS_PATTERNS = [
  /create\s+(another|a\s+new)\s+(store|business)/i,
  /add\s+(another|a\s+new)\s+(store|business)/i,
  /new\s+business/i,
  /another\s+store/i,
];

/**
 * @param {string | null | undefined} userId
 */
export async function loadAccountStoreContext(userId) {
  const uid = String(userId ?? '').trim();
  if (!uid || uid.startsWith('guest_')) {
    return { accountHasStores: false, storeCount: 0, stores: [] };
  }
  const stores = await fetchUserStoresForDisambiguation(uid);
  return {
    accountHasStores: stores.length > 0,
    storeCount: stores.length,
    stores,
  };
}

/**
 * True when the user is explicitly starting a new store/business (greenfield create),
 * not merely missing active store context.
 *
 * @param {{
 *   userMessage?: string;
 *   classification?: { tool?: string; parameters?: Record<string, unknown> } | null;
 *   storeCreateForm?: Record<string, unknown> | null;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   primaryModeHint?: string | null;
 *   primaryMode?: string | null;
 *   action?: string | null;
 * }} [opts]
 */
export function isExplicitGreenfieldCreateStoreIntent(opts = {}) {
  const userMessage = String(opts.userMessage ?? '').trim();
  const storeCreateForm =
    opts.storeCreateForm && typeof opts.storeCreateForm === 'object' && !Array.isArray(opts.storeCreateForm)
      ? opts.storeCreateForm
      : null;
  const formName = String(storeCreateForm?.storeName ?? '').trim();
  if (formName.length >= 2) return true;

  const action = String(opts.action ?? '').trim();
  if (action === 'create_store') return true;

  const primaryMode = String(opts.primaryModeHint ?? opts.primaryMode ?? '')
    .trim()
    .toLowerCase();
  if (primaryMode === 'create' || primaryMode === 'website') return true;

  if (detectExplicitStoreIntent(userMessage)) return true;
  if (EXPLICIT_NEW_BUSINESS_PATTERNS.some((pattern) => pattern.test(userMessage))) return true;

  const classification =
    opts.classification && typeof opts.classification === 'object' ? opts.classification : null;
  const params =
    classification?.parameters && typeof classification.parameters === 'object'
      ? classification.parameters
      : {};
  if (params._autoSubmit === true && formName.length >= 2) return true;

  if (primaryMode === 'store_setup' || primaryMode === 'store_creation') {
    if (isCasualChatTurn(userMessage)) return false;
    return detectExplicitStoreIntent(userMessage) || formName.length >= 2;
  }

  const intentSourceContext =
    opts.intentSourceContext && typeof opts.intentSourceContext === 'object'
      ? opts.intentSourceContext
      : null;
  if (String(intentSourceContext?.assetAction ?? '').trim() === 'create_store') return true;

  return false;
}

/**
 * @param {{
 *   stores: Array<Record<string, unknown>>;
 *   userMessage?: string;
 *   lockedTool?: string;
 *   lockedParams?: Record<string, unknown>;
 *   message?: string;
 * }} opts
 */
export function buildPerformerStoreSelectionClarify(opts = {}) {
  const stores = Array.isArray(opts.stores) ? opts.stores : [];
  const lockedTool = String(opts.lockedTool ?? 'general_chat').trim() || 'general_chat';
  const userMessage = String(opts.userMessage ?? '').trim();
  const message =
    String(opts.message ?? '').trim() ||
    (stores.length > 1
      ? 'You already have businesses on Cardbey. Which one should we work on?'
      : 'Which business should we work on today?');

  const base = buildExecutionContextClarifyPayload({
    stores,
    lockedTool,
    userMessage,
    lockedParams: opts.lockedParams ?? {},
    clarifyType: 'execution_context_store_picker',
  });

  const createNewOption = {
    label: 'Create a new business',
    tool: 'create_store',
    parameters: {
      source: 'explicit_create_from_picker',
      intentMode: 'store',
    },
    hint: 'Start a new store',
    logoUrl: null,
    storeCandidate: null,
  };

  return {
    ...base,
    action: 'clarify',
    clarifyType: 'execution_context_store_picker',
    response: message,
    message,
    options: [...(base.options ?? []), createNewOption],
    storeCandidates: base.storeCandidates ?? stores,
    pendingIntent: {
      ...(base.pendingIntent && typeof base.pendingIntent === 'object' ? base.pendingIntent : {}),
      userMessage,
      originalTool: lockedTool,
      clarifyType: 'execution_context_store_picker',
      storeCandidates: base.storeCandidates ?? stores,
    },
  };
}
