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
