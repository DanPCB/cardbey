/**
 * Durable business locale + cultural prefs via stylePreferences.languageIntelligence.
 */

import { getPrismaClient } from '../../prisma.js';
import { normalizeUserLocalePreference } from '../contracts/userLocalePreference.js';
import { COMMUNICATION_STYLES } from '../contracts/regionProfile.js';
import { isLanguageIntelligencePreferencesV1Enabled } from '../flags.js';
import {
  mergeStorefrontLanguagePolicyIntoBlock,
  normalizeStorefrontLanguagePolicy,
} from '../storefront/storefrontLanguagePolicy.js';

const LI_KEY = 'languageIntelligence';

/**
 * @param {unknown} stylePreferences
 */
export function readBusinessLanguageBlock(stylePreferences) {
  let prefs = stylePreferences;
  if (typeof prefs === 'string') {
    try {
      prefs = JSON.parse(prefs);
    } catch {
      prefs = {};
    }
  }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  const block = prefs[LI_KEY] && typeof prefs[LI_KEY] === 'object' ? prefs[LI_KEY] : {};
  return {
    stylePreferences: prefs,
    block: /** @type {Record<string, unknown>} */ (block),
  };
}

/**
 * @param {string} storeId
 */
export async function getBusinessLocalePreference(storeId) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, stylePreferences: true, region: true, country: true, brandTone: true },
  });
  if (!store) return null;

  const { block } = readBusinessLanguageBlock(store.stylePreferences);
  const locale = normalizeUserLocalePreference(block.locale || {});
  const culturalStyle = COMMUNICATION_STYLES.includes(/** @type {string} */ (block.culturalStyle))
    ? block.culturalStyle
    : null;
  const glossary = Array.isArray(block.glossary) ? block.glossary : [];

  const storefrontLanguagePolicy = normalizeStorefrontLanguagePolicy(
    block.storefrontLanguagePolicy,
    { defaultCanonical: locale.preferredLanguage || null },
  );

  return Object.freeze({
    storeId: store.id,
    locale,
    culturalStyle,
    glossary,
    storefrontLanguagePolicy,
    regionHint: store.region || store.country || null,
    brandTone: store.brandTone || null,
  });
}

/**
 * @param {string} storeId
 * @param {{ locale?: object, culturalStyle?: string|null, glossary?: object[], storefrontLanguagePolicy?: object }} patch
 */
export async function setBusinessLocalePreference(storeId, patch = {}) {
  if (!isLanguageIntelligencePreferencesV1Enabled()) {
    throw new Error('[languageIntelligence] Preferences V1 disabled');
  }
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, stylePreferences: true },
  });
  if (!store) throw new Error('[languageIntelligence] store_not_found');

  const { stylePreferences, block } = readBusinessLanguageBlock(store.stylePreferences);
  let nextBlock = {
    ...block,
    locale: normalizeUserLocalePreference({
      ...(block.locale && typeof block.locale === 'object' ? block.locale : {}),
      ...(patch.locale || {}),
    }),
  };

  if (patch.culturalStyle !== undefined) {
    if (
      patch.culturalStyle == null ||
      COMMUNICATION_STYLES.includes(/** @type {string} */ (patch.culturalStyle))
    ) {
      nextBlock.culturalStyle = patch.culturalStyle;
    } else {
      throw new Error(`[languageIntelligence] Invalid culturalStyle: ${patch.culturalStyle}`);
    }
  }
  if (Array.isArray(patch.glossary)) {
    nextBlock.glossary = patch.glossary;
  }
  if (patch.storefrontLanguagePolicy && typeof patch.storefrontLanguagePolicy === 'object') {
    nextBlock = mergeStorefrontLanguagePolicyIntoBlock(nextBlock, patch.storefrontLanguagePolicy);
  }

  const nextPrefs = {
    ...stylePreferences,
    [LI_KEY]: nextBlock,
  };

  await prisma.business.update({
    where: { id: storeId },
    data: { stylePreferences: nextPrefs },
  });

  return getBusinessLocalePreference(storeId);
}

/**
 * Merge glossary entries into business LI block (replace by id).
 * @param {string} storeId
 * @param {object[]} entries
 */
export async function upsertBusinessGlossaryEntries(storeId, entries) {
  const current = await getBusinessLocalePreference(storeId);
  if (!current) throw new Error('[languageIntelligence] store_not_found');
  const byId = new Map((current.glossary || []).map((e) => [e.id, e]));
  for (const entry of entries || []) {
    if (!entry?.id) continue;
    byId.set(entry.id, { ...byId.get(entry.id), ...entry });
  }
  return setBusinessLocalePreference(storeId, { glossary: [...byId.values()] });
}
