/**
 * buildStoreInputV1.js
 * Canonical contract for store build input — single source of truth.
 *
 * Every runway that calls runBuildStoreJob MUST serialize its input
 * through normalizeBuildStoreInput() before passing to createBuildStoreJob.
 *
 * Runways:
 *   1. Intake V2 create_store (_autoSubmit / shortcut)  → executeStoreMissionPipelineRun
 *   2. MI Orchestra /start                              → miRoutes.js
 *   3. Operator tool start_build_store                  → ai/operator/tools/index.js
 *   4. Business route POST /api/business/create         → routes/business.js
 *
 * All four must produce identical BuildStoreInputV1 for the same logical request.
 * The three golden tests in buildStoreInputV1.test.js enforce this.
 */

// ─── Field name constants (aligns with missionIntentPayloadKeys.js pattern) ──

export const BUILD_STORE_INPUT_KEYS = {
  // Identity
  BUSINESS_NAME:   'businessName',    // canonical — storeName aliases to this
  BUSINESS_TYPE:   'businessType',    // canonical — storeType aliases to this
  STORE_TYPE:      'storeType',       // secondary alias (kept for buildCatalog compat)
  LOCATION:        'location',
  INTENT_MODE:     'intentMode',      // 'store' | 'website' | 'personal_presence'
  CURRENCY_CODE:   'currencyCode',

  // Build parameters
  RAW_USER_TEXT:   'rawUserText',     // canonical — prompt / rawInput alias to this
  SOURCE_TYPE:     'sourceType',      // 'form' | 'ocr' | 'url' | 'operator' | 'business_api'
  WEBSITE_URL:     'websiteUrl',      // for URL-based builds
  INCLUDE_IMAGES:  'includeImages',

  // Execution context
  STORE_ID:        'storeId',
  TENANT_ID:       'tenantId',
  USER_ID:         'userId',
  GENERATION_RUN_ID: 'generationRunId',
  MISSION_ID:      'missionId',
};

// ─── Intent mode values ───────────────────────────────────────────────────────

export const INTENT_MODES = {
  STORE:            'store',
  WEBSITE:          'website',
  PERSONAL_PRESENCE: 'personal_presence',
};

// ─── Source type values ───────────────────────────────────────────────────────

export const SOURCE_TYPES = {
  FORM:         'form',
  OCR:          'ocr',
  URL:          'url',
  OPERATOR:     'operator',
  BUSINESS_API: 'business_api',
};

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BuildStoreInputV1
 * @property {string}  businessName      — display name (required unless rawUserText present)
 * @property {string}  businessType      — category/vertical
 * @property {string}  storeType         — alias kept for buildCatalog compat
 * @property {string}  location          — city/region string
 * @property {string}  intentMode        — 'store' | 'website' | 'personal_presence'
 * @property {string}  currencyCode      — ISO 4217 e.g. 'AUD'
 * @property {string}  rawUserText       — original user input (canonical name)
 * @property {string}  sourceType        — which runway produced this input
 * @property {string}  websiteUrl        — URL for url-based builds
 * @property {boolean} includeImages     — whether to fetch product images
 * @property {string}  storeId           — target store id ('temp' for new stores)
 * @property {string}  tenantId          — tenant/business id
 * @property {string}  userId            — acting user id
 * @property {string}  generationRunId   — idempotency / correlation key
 * @property {string}  missionId         — linked mission pipeline id
 */

/**
 * Normalize any runway's raw input object into BuildStoreInputV1.
 * Handles all field aliases. Logs a warning if both businessName and rawUserText are empty.
 *
 * @param {object} raw - raw input from any runway
 * @param {object} [opts]
 * @param {string} [opts.sourceType] - override source type
 * @returns {BuildStoreInputV1}
 */
export function normalizeBuildStoreInput(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    raw = {};
  }

  // ── businessName: canonical field, storeName is alias ─────────────────────
  const businessName =
    trimStr(raw.businessName) ||
    trimStr(raw.storeName) ||     // Intake V2 classifier uses storeName
    '';

  // ── businessType: canonical, storeType / businessType are aliases ──────────
  const businessType =
    trimStr(raw.businessType) ||
    trimStr(raw.storeType) ||
    trimStr(raw.requestBusinessType) || // orchestra path alias
    '';

  // storeType preserved as secondary for buildCatalog compat
  const storeType = trimStr(raw.storeType) || businessType;

  // ── location ───────────────────────────────────────────────────────────────
  const location = trimStr(raw.location) || '';

  // ── intentMode: default 'store' ────────────────────────────────────────────
  const intentModeRaw =
    trimStr(raw.intentMode) ||
    trimStr(raw.mode) ||          // some callers use mode
    '';
  const intentMode =
    (INTENT_MODES[intentModeRaw.toUpperCase()] ?? intentModeRaw) || INTENT_MODES.STORE;

  // ── currencyCode: uppercase, default empty ─────────────────────────────────
  const currencyCode = trimStr(raw.currencyCode)?.toUpperCase() || '';

  // ── rawUserText: canonical, prompt / rawInput are aliases ──────────────────
  const rawUserText =
    trimStr(raw.rawUserText) ||
    trimStr(raw.rawInput) ||       // orchestra / createBuildStoreJob alias
    trimStr(raw.prompt) ||         // draft.input alias
    trimStr(raw.userMessage) ||    // Intake V2 alias
    '';

  // ── sourceType: from opts override or raw ─────────────────────────────────
  const sourceType = trimStr(opts.sourceType) || trimStr(raw.sourceType) || SOURCE_TYPES.FORM;

  // ── websiteUrl ─────────────────────────────────────────────────────────────
  const websiteUrl = trimStr(raw.websiteUrl) || '';

  // ── includeImages: default true ────────────────────────────────────────────
  const includeImages = raw.includeImages !== false;

  // ── execution context ──────────────────────────────────────────────────────
  const storeId     = trimStr(raw.storeId)          || 'temp';
  const tenantId    = trimStr(raw.tenantId)          || trimStr(raw.tenantKey) || '';
  const userId      = trimStr(raw.userId)            || '';
  const generationRunId = trimStr(raw.generationRunId) || '';
  const missionId   = trimStr(raw.missionId)         || '';

  // ── Validation warning (not a hard failure — matches current gate philosophy) ──
  if (!businessName && !rawUserText) {
    console.warn('[BuildStoreInputV1] normalizeBuildStoreInput: both businessName and rawUserText are empty', {
      sourceType,
      intentMode,
      storeId,
      missionId: missionId || '(none)',
    });
  }

  return {
    businessName,
    businessType,
    storeType,
    location,
    intentMode,
    currencyCode,
    rawUserText,
    sourceType,
    websiteUrl,
    includeImages,
    storeId,
    tenantId,
    userId,
    generationRunId,
    missionId,
  };
}

function trimStr(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s === '' ? '' : s;
}

/**
 * Serialize BuildStoreInputV1 to the shape createBuildStoreJob expects.
 * This is the only place the V1 → legacy field mapping lives.
 *
 * @param {BuildStoreInputV1} input
 * @returns {object} shape for createBuildStoreJob
 */
export function serializeToBuildStoreJobInput(input) {
  return {
    businessName:     input.businessName  || undefined,
    businessType:     input.businessType  || undefined,
    storeType:        input.storeType     || undefined,
    location:         input.location      || undefined,
    intentMode:       input.intentMode    || undefined,
    currencyCode:     input.currencyCode  || undefined,
    rawInput:         input.rawUserText   || undefined,  // createBuildStoreJob uses rawInput
    storeId:          input.storeId       || 'temp',
    tenantId:         input.tenantId      || undefined,
    userId:           input.userId        || undefined,
    generationRunId:  input.generationRunId || undefined,
    includeImages:    input.includeImages,
    sourceType:       input.sourceType    || undefined,
    websiteUrl:       input.websiteUrl    || undefined,
  };
}
