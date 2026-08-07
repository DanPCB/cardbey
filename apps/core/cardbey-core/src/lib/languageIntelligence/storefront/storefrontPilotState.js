/**
 * Explicit storefront language pilot enrollment (Stage 5A).
 * Stored at stylePreferences.languageIntelligence.storefrontPilot
 */

import { getPrismaClient } from '../../prisma.js';
import { readBusinessLanguageBlock } from '../preferences/businessPreferenceStore.js';
import { PUBLIC_TRANSLATION_CONSUMPTION_POLICIES } from './translationQualityStatus.js';

export const PILOT_VALIDATION_STATUSES = Object.freeze([
  'not_enrolled',
  'configured',
  'translation_review_required',
  'ready',
  'paused',
  'failed',
]);

/**
 * @param {unknown} raw
 */
export function normalizeStorefrontPilotState(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const enrolled = r.enrolled === true;
  const paused = r.paused === true || r.validationStatus === 'paused';
  const cohort =
    r.cohort === 'internal' || r.cohort === 'founder' || r.cohort === 'selected_store'
      ? r.cohort
      : null;
  let validationStatus = PILOT_VALIDATION_STATUSES.includes(/** @type {string} */ (r.validationStatus))
    ? /** @type {string} */ (r.validationStatus)
    : enrolled
      ? 'configured'
      : 'not_enrolled';
  if (paused) validationStatus = 'paused';

  const consumptionPolicy = PUBLIC_TRANSLATION_CONSUMPTION_POLICIES.includes(
    /** @type {string} */ (r.publicTranslationConsumptionPolicy),
  )
    ? /** @type {string} */ (r.publicTranslationConsumptionPolicy)
    : enrolled
      ? 'approved_translations_only'
      : 'existing_valid_translations';

  return Object.freeze({
    enrolled,
    paused,
    cohort,
    enrolledAt: typeof r.enrolledAt === 'string' ? r.enrolledAt : null,
    enrolledBy: typeof r.enrolledBy === 'string' ? r.enrolledBy : null,
    validationStatus,
    publicTranslationConsumptionPolicy: consumptionPolicy,
    killSwitch: r.killSwitch === true,
  });
}

/**
 * @param {object|null|undefined} business
 */
export function getStorefrontPilotStateFromBusiness(business) {
  let prefs = business?.stylePreferences;
  if (typeof prefs === 'string') {
    try {
      prefs = JSON.parse(prefs);
    } catch {
      prefs = {};
    }
  }
  const block =
    prefs?.languageIntelligence && typeof prefs.languageIntelligence === 'object'
      ? prefs.languageIntelligence
      : {};
  return normalizeStorefrontPilotState(block.storefrontPilot);
}

/**
 * @param {string} storeId
 */
export async function getStorefrontPilotState(storeId) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { stylePreferences: true },
  });
  if (!store) return normalizeStorefrontPilotState({});
  const { block } = readBusinessLanguageBlock(store.stylePreferences);
  return normalizeStorefrontPilotState(block.storefrontPilot);
}

/**
 * @param {string} storeId
 * @param {Partial<ReturnType<typeof normalizeStorefrontPilotState>> & { actorUserId?: string }} patch
 */
export async function setStorefrontPilotState(storeId, patch = {}) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, stylePreferences: true },
  });
  if (!store) throw new Error('[languageIntelligence] store_not_found');
  const { stylePreferences, block } = readBusinessLanguageBlock(store.stylePreferences);
  const current = normalizeStorefrontPilotState(block.storefrontPilot);
  const now = new Date().toISOString();
  const next = normalizeStorefrontPilotState({
    ...current,
    ...patch,
    enrolled: patch.enrolled !== undefined ? patch.enrolled : current.enrolled,
    paused: patch.paused !== undefined ? patch.paused : current.paused,
    enrolledAt: patch.enrolled === true && !current.enrolled ? now : current.enrolledAt,
    enrolledBy:
      patch.enrolled === true && !current.enrolled
        ? patch.actorUserId || current.enrolledBy
        : current.enrolledBy,
    publicTranslationConsumptionPolicy:
      patch.publicTranslationConsumptionPolicy ||
      (patch.enrolled === true
        ? 'approved_translations_only'
        : current.publicTranslationConsumptionPolicy),
  });

  await prisma.business.update({
    where: { id: storeId },
    data: {
      stylePreferences: {
        ...stylePreferences,
        languageIntelligence: {
          ...block,
          storefrontPilot: next,
        },
      },
    },
  });
  return next;
}

/**
 * Public cutover may apply localized fields only when pilot allows.
 */
export function isPilotPublicLocalizationAllowed(pilot) {
  if (!pilot?.enrolled) return false;
  if (pilot.paused || pilot.killSwitch) return false;
  if (pilot.validationStatus === 'paused' || pilot.validationStatus === 'failed') return false;
  return true;
}
