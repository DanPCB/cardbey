/**
 * Durable user locale preferences via AccountProfile.languages JSON.
 */

import { getPrismaClient } from '../../prisma.js';
import { ensureAccountProfile } from '../../account/accountProfileService.js';
import { normalizeUserLocalePreference } from '../contracts/userLocalePreference.js';
import { readLanguagesField, mergeLanguagesField } from './languagesField.js';
import { isLanguageIntelligencePreferencesV1Enabled } from '../flags.js';

/**
 * @param {string} userId
 */
export async function getUserLocalePreference(userId) {
  if (!userId) return normalizeUserLocalePreference({});
  const prisma = getPrismaClient();
  const profile = await prisma.accountProfile.findUnique({ where: { userId } });
  const { preference, spoken } = readLanguagesField(profile?.languages);
  return Object.freeze({
    ...preference,
    spokenLanguages: spoken,
  });
}

/**
 * @param {string} userId
 * @param {object} patch  UserLocalePreference fields + optional spokenLanguages
 */
export async function setUserLocalePreference(userId, patch = {}) {
  if (!isLanguageIntelligencePreferencesV1Enabled()) {
    throw new Error('[languageIntelligence] Preferences V1 disabled');
  }
  if (!userId) throw new Error('[languageIntelligence] userId required');

  await ensureAccountProfile(userId);
  const prisma = getPrismaClient();
  const profile = await prisma.accountProfile.findUnique({ where: { userId } });
  const { spokenLanguages, ...prefPatch } = patch || {};

  const next = mergeLanguagesField(profile?.languages, {
    spoken: Array.isArray(spokenLanguages) ? spokenLanguages : undefined,
    preference: {
      ...prefPatch,
      manualLanguageSelection:
        prefPatch.manualLanguageSelection !== undefined
          ? prefPatch.manualLanguageSelection
          : prefPatch.preferredLanguage
            ? true
            : undefined,
    },
  });

  await prisma.accountProfile.update({
    where: { userId },
    data: { languages: next },
  });

  return getUserLocalePreference(userId);
}
