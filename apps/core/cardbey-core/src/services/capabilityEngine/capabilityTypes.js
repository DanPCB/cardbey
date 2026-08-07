/** Capability Engine enums (Phase 4A). */

export const CAPABILITY_TYPE = Object.freeze({
  CONTENT_PACK: 'CONTENT_PACK',
  STORE_SETUP: 'STORE_SETUP',
  CAMPAIGN_SETUP: 'CAMPAIGN_SETUP',
  DISPLAY_SETUP: 'DISPLAY_SETUP',
});

export const PILOT_CAPABILITY_TYPES = Object.freeze(Object.values(CAPABILITY_TYPE));

export const CAPABILITY_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
});

export const VERSION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  SUPERSEDED: 'SUPERSEDED',
});

export const COMPONENT_TYPE = Object.freeze({
  LIBRARY_ASSET: 'LIBRARY_ASSET',
  COLLECTION: 'COLLECTION',
  PLATFORM_ACTION: 'PLATFORM_ACTION',
  CONFIGURATION: 'CONFIGURATION',
  VALIDATION: 'VALIDATION',
  DEPENDENCY: 'DEPENDENCY',
});

export const INPUT_TYPE = Object.freeze({
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  ENUM: 'ENUM',
  ASSET_REFERENCE: 'ASSET_REFERENCE',
  STORE_REFERENCE: 'STORE_REFERENCE',
  BUSINESS_REFERENCE: 'BUSINESS_REFERENCE',
  LANGUAGE: 'LANGUAGE',
  LOCATION: 'LOCATION',
});

export const APPLICABILITY = Object.freeze({
  APPLICABLE: 'APPLICABLE',
  APPLICABLE_WITH_INPUTS: 'APPLICABLE_WITH_INPUTS',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  BLOCKED: 'BLOCKED',
});

export const INSTALL_STATUS = Object.freeze({
  PLANNED: 'PLANNED',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  RUNNING: 'RUNNING',
  INSTALLED: 'INSTALLED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
});

export const FAILURE_POLICY = Object.freeze({
  STOP: 'STOP',
  ROLLBACK_ALL: 'ROLLBACK_ALL',
  ROLLBACK_STEP: 'ROLLBACK_STEP',
  CONTINUE_OPTIONAL: 'CONTINUE_OPTIONAL',
  REQUIRE_REVIEW: 'REQUIRE_REVIEW',
});

/** Allowlisted adapter keys only — no arbitrary code. */
export const ALLOWED_ADAPTERS = Object.freeze({
  ATTACH_LIBRARY_ASSETS: 'attach_library_assets',
  APPLY_STOREFRONT_TEMPLATE_DRAFT: 'apply_storefront_template_draft',
  CREATE_MENU_STRUCTURE_DRAFT: 'create_menu_structure_draft',
  CREATE_PROMOTION_DRAFT: 'create_promotion_draft',
  CREATE_DISPLAY_PLAYLIST_DRAFT: 'create_display_playlist_draft',
  REQUEST_USER_CONFIRMATION: 'request_user_confirmation',
});

export function isPilotCapabilityType(type) {
  return PILOT_CAPABILITY_TYPES.includes(String(type || ''));
}

export function isAllowedAdapter(key) {
  return Object.values(ALLOWED_ADAPTERS).includes(String(key || ''));
}
