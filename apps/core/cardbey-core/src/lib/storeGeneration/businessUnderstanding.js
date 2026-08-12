/**
 * BusinessUnderstanding — normalized business model for store composition.
 * Phase 1 contract (unwired). Maps later from StoreGenerationBusinessContext + BUE + evidence.
 */

import { storeField } from './fieldStatus.js';

/**
 * @typedef {import('./fieldStatus.js').StoreField} StoreField
 * @typedef {import('./businessArchetypes.js').BusinessArchetype} BusinessArchetype
 */

/**
 * @typedef {{
 *   schema: 'cb-business-understanding',
 *   version: 'v1',
 *   identity: {
 *     name: StoreField<string|null>,
 *     slogan?: StoreField<string|null>,
 *     location?: StoreField<string|null>,
 *     phone?: StoreField<string|null>,
 *     email?: StoreField<string|null>,
 *     website?: StoreField<string|null>,
 *   },
 *   businessModel: StoreField<string|null>,
 *   industry: StoreField<string|null>,
 *   category: StoreField<string|null>,
 *   subcategory: StoreField<string|null>,
 *   archetype: BusinessArchetype | null,
 *   offerings: Array<StoreField<string> & { kind?: 'product'|'service'|'menu_item'|'package'|'other' }>,
 *   customerIntent: string[],
 *   transactionModel: StoreField<'ecommerce'|'order'|'booking'|'inquiry'|'hybrid'|'none'|null>,
 *   serviceModel: StoreField<string|null>,
 *   locationModel: StoreField<'physical'|'online'|'hybrid'|null>,
 *   trustModel: StoreField<string|null>,
 *   primaryActions: string[],
 *   secondaryActions: string[],
 *   importantInformation: string[],
 *   evidenceRefs: string[],
 *   confidence: number,
 * }} BusinessUnderstanding
 */

/**
 * @param {Partial<BusinessUnderstanding>} [input]
 * @returns {BusinessUnderstanding}
 */
export function createEmptyBusinessUnderstanding(input = {}) {
  return {
    schema: 'cb-business-understanding',
    version: 'v1',
    identity: {
      name: input.identity?.name || storeField(null, { status: 'UNKNOWN' }),
      slogan: input.identity?.slogan || storeField(null, { status: 'UNKNOWN' }),
      location: input.identity?.location || storeField(null, { status: 'UNKNOWN' }),
      phone: input.identity?.phone || storeField(null, { status: 'UNKNOWN' }),
      email: input.identity?.email || storeField(null, { status: 'UNKNOWN' }),
      website: input.identity?.website || storeField(null, { status: 'UNKNOWN' }),
    },
    businessModel: input.businessModel || storeField(null, { status: 'UNKNOWN' }),
    industry: input.industry || storeField(null, { status: 'UNKNOWN' }),
    category: input.category || storeField(null, { status: 'UNKNOWN' }),
    subcategory: input.subcategory || storeField(null, { status: 'UNKNOWN' }),
    archetype: input.archetype ?? null,
    offerings: Array.isArray(input.offerings) ? input.offerings : [],
    customerIntent: Array.isArray(input.customerIntent) ? input.customerIntent : [],
    transactionModel: input.transactionModel || storeField(null, { status: 'UNKNOWN' }),
    serviceModel: input.serviceModel || storeField(null, { status: 'UNKNOWN' }),
    locationModel: input.locationModel || storeField(null, { status: 'UNKNOWN' }),
    trustModel: input.trustModel || storeField(null, { status: 'UNKNOWN' }),
    primaryActions: Array.isArray(input.primaryActions) ? input.primaryActions : [],
    secondaryActions: Array.isArray(input.secondaryActions) ? input.secondaryActions : [],
    importantInformation: Array.isArray(input.importantInformation)
      ? input.importantInformation
      : [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    confidence:
      typeof input.confidence === 'number' && Number.isFinite(input.confidence)
        ? Math.max(0, Math.min(1, input.confidence))
        : 0,
  };
}

/**
 * Strip meta-commentary from display copy (taglines, CTAs, headings).
 * @param {unknown} raw
 * @returns {string}
 */
export function toDisplayReadyCopy(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  s = s.replace(/^suggested\s+tagline\s*:\s*/i, '');
  s = s.replace(/^a\s+professional\s+slogan\s+for\s+[^:]+:\s*/i, '');
  s = s.replace(/^tagline\s*:\s*/i, '');
  s = s.replace(/^cta\s*:\s*/i, '');
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith('\u201c') && s.endsWith('\u201d'))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export default {
  createEmptyBusinessUnderstanding,
  toDisplayReadyCopy,
};
