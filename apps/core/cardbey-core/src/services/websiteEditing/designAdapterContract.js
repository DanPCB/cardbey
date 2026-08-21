/**
 * Website Editing Design adapter — Phase C1 contract (read-only).
 * section=design. Commands typed but not configured for mutation until C2.
 */

export const DESIGN_ADAPTER_ID = 'design';
export const DESIGN_ADAPTER_SECTION = 'design';

/** Future mutation commands — not executable in C1. */
export const DESIGN_ADAPTER_COMMANDS = Object.freeze([
  'setTemplate',
  'setHero',
  'setDraftSections',
  'setDesignTokens',
  'setLayoutVariant',
]);

/**
 * Deterministic source precedence for future C2 persistence (document + test).
 * Higher index = lower priority.
 */
export const DESIGN_SOURCE_PRECEDENCE = Object.freeze([
  'approved_canonical_draft_design',
  'draft_store_preview',
  'adopted_composition_design',
  'business_style_preferences',
  'mini_website_legacy',
  'defaults',
]);

export const DESIGN_PROVENANCE = Object.freeze({
  DRAFT_STORE: 'draft_store',
  BUSINESS_STYLE_PREFERENCES: 'business_style_preferences',
  MINI_WEBSITE: 'mini_website',
  BRAND_PROFILE: 'brand_profile',
  WEBSITE_DIRECTION: 'website_direction',
  COMPOSITION_ADOPTION: 'composition_adoption',
  LOCAL_LEGACY: 'local_legacy',
  MISSING: 'missing',
  CONFLICT: 'conflict',
});

export const DESIGN_READINESS = Object.freeze({
  NOT_ENABLED: 'NOT_ENABLED',
  READ_ONLY_CONTRACT_READY: 'READ_ONLY_CONTRACT_READY',
  SOURCE_CONFLICT: 'SOURCE_CONFLICT',
  BLOCKED_BY_MISSING_DRAFT: 'BLOCKED_BY_MISSING_DRAFT',
  BLOCKED_BY_COMPOSITION_STATE: 'BLOCKED_BY_COMPOSITION_STATE',
});

/**
 * @param {string|null|undefined} command
 * @returns {boolean}
 */
export function isDesignAdapterCommand(command) {
  return DESIGN_ADAPTER_COMMANDS.includes(String(command || '').trim());
}

/**
 * C1: commands are typed but not configured — always false for mutation allow.
 * @param {string|null|undefined} command
 */
export function isDesignAdapterCommandConfigured(command) {
  void command;
  return false;
}

/**
 * @param {string|null|undefined} section
 */
export function isDesignAdapterSection(section) {
  const v = String(section || '')
    .trim()
    .toLowerCase();
  return v === 'design' || v === 'presentation' || v === 'style';
}
