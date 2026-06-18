/**
 * Runtime action types for upload and state-changing UI operations.
 * State-changing actions must use these keys via Performer Runtime / unified dispatch.
 */

export const UPLOAD_ACTIONS = {
  UPLOAD_HERO_MEDIA: 'upload_hero_media',
  UPLOAD_HERO_VIDEO: 'upload_hero_video',
  UPLOAD_HERO_IMAGE: 'upload_hero_image',
  UPLOAD_LOGO: 'upload_logo',
  UPLOAD_AVATAR: 'upload_avatar',
  PATCH_HERO: 'update_hero_artifact',
  PATCH_AVATAR: 'update_avatar_artifact',
  UPLOAD_PRODUCT_IMAGE: 'upload_product_image',
  SAVE_DRAFT_PREVIEW: 'save_draft_preview',
  UPLOAD_EXPLORE_VIDEO: 'upload_explore_video',
  UPLOAD_CONTENT: 'upload_content',
};

/** Publish / lifecycle actions routed through unified intake dispatch. */
export const DISPATCH_ACTIONS = {
  PUBLISH_STORE: 'publish_store',
  REPUBLISH_WEBSITE: 'republish_website',
  DELETE_STORE: 'delete_store',
  DELETE_CONTENT: 'delete_content',
  DELETE_PRODUCT: 'delete_product',
  DELETE_DRAFT: 'delete_draft',
  PUBLISH_CARDBEY: 'publish_cardbey',
  PUBLISH_CUSTOM_DOMAIN: 'publish_custom_domain',
  PUBLISH_CAMPAIGN: 'publish_campaign',
  CREATE_OFFER_DRAFT: 'create_offer_draft',
  ACTIVATE_BUSINESS_SPACE: 'activate_business_space',
  ACCEPT_ENRICHMENT_SUGGESTION: 'accept_enrichment_suggestion',
  GENERATE_FULL_STORE_FROM_SEED: 'generate_full_store_from_seed',
  SAVE_DRAFT_PREVIEW: 'save_draft_preview',
  ANALYZE_STORE: 'analyze_store',
  DIAGNOSE_STORE: 'diagnose_store',
  GENERATE_CONTENT: 'generate_content',
  CREATE_CAMPAIGN: 'create_campaign',
};

/** @type {Record<string, { requireConfirmation: boolean, risk: 'low'|'medium'|'high' }>} */
export const UPLOAD_CONFIG = {
  [UPLOAD_ACTIONS.UPLOAD_HERO_MEDIA]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.UPLOAD_HERO_VIDEO]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.UPLOAD_HERO_IMAGE]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.UPLOAD_LOGO]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.UPLOAD_AVATAR]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.PATCH_HERO]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.PATCH_AVATAR]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.UPLOAD_PRODUCT_IMAGE]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.SAVE_DRAFT_PREVIEW]: { requireConfirmation: false, risk: 'medium' },
  [UPLOAD_ACTIONS.UPLOAD_EXPLORE_VIDEO]: { requireConfirmation: false, risk: 'low' },
  [UPLOAD_ACTIONS.UPLOAD_CONTENT]: { requireConfirmation: false, risk: 'low' },
  [DISPATCH_ACTIONS.PUBLISH_STORE]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.REPUBLISH_WEBSITE]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.DELETE_STORE]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.DELETE_CONTENT]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.DELETE_PRODUCT]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.DELETE_DRAFT]: { requireConfirmation: true, risk: 'medium' },
  [DISPATCH_ACTIONS.SAVE_DRAFT_PREVIEW]: { requireConfirmation: false, risk: 'low' },
  [DISPATCH_ACTIONS.PUBLISH_CARDBEY]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.PUBLISH_CUSTOM_DOMAIN]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.PUBLISH_CAMPAIGN]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.CREATE_OFFER_DRAFT]: { requireConfirmation: true, risk: 'medium' },
  [DISPATCH_ACTIONS.ACTIVATE_BUSINESS_SPACE]: { requireConfirmation: true, risk: 'high' },
  [DISPATCH_ACTIONS.ACCEPT_ENRICHMENT_SUGGESTION]: { requireConfirmation: true, risk: 'medium' },
  [DISPATCH_ACTIONS.GENERATE_FULL_STORE_FROM_SEED]: { requireConfirmation: false, risk: 'low' },
  [DISPATCH_ACTIONS.ANALYZE_STORE]: { requireConfirmation: false, risk: 'low' },
  [DISPATCH_ACTIONS.DIAGNOSE_STORE]: { requireConfirmation: false, risk: 'low' },
  [DISPATCH_ACTIONS.GENERATE_CONTENT]: { requireConfirmation: false, risk: 'low' },
  [DISPATCH_ACTIONS.CREATE_CAMPAIGN]: { requireConfirmation: true, risk: 'high' },
};

const UPLOAD_ACTION_VALUES = new Set(Object.values(UPLOAD_ACTIONS));
const DISPATCH_ACTION_VALUES = new Set(Object.values(DISPATCH_ACTIONS));
const RUNTIME_ACTION_VALUES = new Set([...UPLOAD_ACTION_VALUES, ...DISPATCH_ACTION_VALUES]);

/**
 * @param {string} action
 * @returns {boolean}
 */
export function isRuntimeUploadAction(action) {
  return UPLOAD_ACTION_VALUES.has(String(action ?? '').trim());
}

/**
 * @param {string} action
 * @returns {boolean}
 */
export function isRuntimeDispatchAction(action) {
  return RUNTIME_ACTION_VALUES.has(String(action ?? '').trim());
}

/**
 * @param {string} action
 * @returns {{ requireConfirmation: boolean, risk: string } | null}
 */
export function getUploadActionConfig(action) {
  return UPLOAD_CONFIG[String(action ?? '').trim()] ?? null;
}

/** Alias for unified dispatch metadata lookup. */
export function getRuntimeActionConfig(action) {
  return getUploadActionConfig(action);
}