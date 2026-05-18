/**
 * Deterministic system shortcuts only.
 *
 * Phase 5B removed store-setup regex fast-paths from Intake V2 classification.
 * Phase 5B/5C: first-hop store creation detection is owned by `intakeClassifier.js` (LLM + routing rules),
 * so this shortcuts layer must not duplicate store/mini-website phrase matching.
 */

const STORE_CREATE_PRIMARY_MODES = new Set(['create', 'website', 'store_setup']);

function resolvePrimaryMode(input) {
  const pm = String(input?.primaryMode ?? input?.primaryModeHint ?? '')
    .trim()
    .toLowerCase();
  return pm || null;
}

/** @param {unknown} form */
/**
 * Validates create-store / mini-website payload before dispatching the pipeline or tool runner.
 *
 * @param {Record<string, unknown>} payload
 * @returns {Array<{ field: string; message: string }>}
 */
export function validateCreateStorePayload(payload = {}) {
  const errors = [];
  const envelope = payload?.storeCreateForm;
  let name =
    envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      ? /** @type {Record<string, unknown>} */ (envelope).storeName ??
        /** @type {Record<string, unknown>} */ (envelope).businessName
      : payload?.storeName ?? payload?.businessName;
  name = name != null ? String(name).trim() : '';
  let location =
    envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      ? /** @type {Record<string, unknown>} */ (envelope).location
      : payload?.location;
  location = location != null ? String(location).trim() : '';
  const categoryRaw =
    envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      ? /** @type {Record<string, unknown>} */ (envelope).category ??
        /** @type {Record<string, unknown>} */ (envelope).storeType ??
        /** @type {Record<string, unknown>} */ (envelope).businessType
      : payload?.category ?? payload?.storeType ?? payload?.businessType;
  const category = categoryRaw != null ? String(categoryRaw).trim() : '';

  if (!name || name.length < 2) {
    errors.push({ field: 'storeName', message: 'Store name is required' });
  }
  if (!location || location.length < 2) {
    errors.push({
      field: 'location',
      message: 'Please enter a full city or suburb name (e.g. Melbourne)',
    });
  }
  if (!category) {
    errors.push({ field: 'category', message: 'Please select a category' });
  }

  return errors;
}

function storeCreateFormShortcut(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return null;
  const storeName = String(/** @type {Record<string, unknown>} */ (form).storeName ?? '').trim();
  if (!storeName) return null;
  const mode = String(/** @type {Record<string, unknown>} */ (form).intentMode ?? '')
    .trim()
    .toLowerCase();
  return {
    type: 'create_store',
    intentMode: mode === 'website' ? 'website' : 'store',
  };
}

/**
 * @param {object} input
 * @param {string} input.userMessage
 * @param {string} [input.primaryMode]
 * @param {string} [input.primaryModeHint]
 * @param {string} [input.intentSource]
 * @param {object} [input.storeCreateForm]
 * @param {{ userId?: string | null, isGuest?: boolean }} input.auth
 * @returns {{ type: 'create_store', intentMode: 'store'|'website' } | { type: 'auth_required', message: string } | { type: 'missing_store', message: string } | null}
 */
export function detectIntent(input) {
  const formShortcut = storeCreateFormShortcut(input?.storeCreateForm);
  if (formShortcut) return formShortcut;

  const raw = String(input?.userMessage ?? '').trim();
  if (!raw) return null;

  const primaryMode = resolvePrimaryMode(input);
  const intentSource = String(input?.intentSource ?? '')
    .trim()
    .toLowerCase();

  if (primaryMode && STORE_CREATE_PRIMARY_MODES.has(primaryMode)) {
    return {
      type: 'create_store',
      intentMode: primaryMode === 'website' ? 'website' : 'store',
    };
  }

  // Frontscreen handoff with explicit create mode (URL primaryMode=create).
  if (intentSource === 'frontscreen' && primaryMode === 'create') {
    return { type: 'create_store', intentMode: 'store' };
  }

  return null;
}

const POSTER_TRIGGERS = [
  'create.*poster',
  'make.*poster',
  'design.*poster',
  'promotional.*poster',
  'create.*flyer',
  'make.*flyer',
  'social.*post',
  'instagram.*post',
  'marketing.*material',
];

/**
 * Detect poster / flyer creation intent for Performer direct_action.
 *
 * @param {string} userMessage
 * @param {string | null | undefined} activeStoreId
 * @returns {{ tool: 'generate_poster', executionPath: 'direct_action', confidence: number, params: { storeId: string, posterType: string } } | null}
 */
export function detectPosterIntent(userMessage, activeStoreId) {
  const text = String(userMessage ?? '').trim();
  const storeId = typeof activeStoreId === 'string' ? activeStoreId.trim() : '';
  if (!text || !storeId) return null;

  const isPosterIntent = POSTER_TRIGGERS.some((pattern) => new RegExp(pattern, 'i').test(text));
  if (!isPosterIntent) return null;

  return {
    tool: 'generate_poster',
    executionPath: 'direct_action',
    confidence: 0.9,
    params: {
      storeId,
      posterType: text.includes('story') ? 'story' : text.includes('offer') ? 'offer' : 'promotional',
    },
  };
}

const POSTER_EDIT_TRIGGERS =
  /\b(change|update|swap|replace|edit|make)\b.*\b(title|subtitle|headline|image|photo|background|color|font)\b/i;

/**
 * @param {string} userMessage
 * @param {boolean} hasPosterContext — e.g. prior poster elements in request body
 */
export function detectPosterEditIntent(userMessage, hasPosterContext) {
  const text = String(userMessage ?? '').trim();
  if (!text || !hasPosterContext) return null;
  if (!POSTER_EDIT_TRIGGERS.test(text)) return null;
  return {
    tool: 'mutate_poster',
    executionPath: 'direct_action',
    confidence: 0.88,
    params: { instruction: text },
  };
}
