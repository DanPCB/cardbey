/**
 * CulturalAdaptation — regional communication style / tone for AI prompts.
 * Presentation guidance only; does not translate or mutate content.
 */

import { COMMUNICATION_STYLES } from '../contracts/regionProfile.js';
import { getRegion, getLanguage } from '../registries/index.js';
import { normalizeLanguageCode } from '../contracts/languageCode.js';

const STYLE_GUIDANCE = Object.freeze({
  polite:
    'Use polite, respectful phrasing. Prefer soft requests over commands. Warm but deferential.',
  formal:
    'Use formal register. Avoid slang and overly casual contractions. Show respect and precision.',
  friendly:
    'Use a warm, approachable, conversational tone. Keep it clear and helpful without being stiff.',
  direct:
    'Be clear and concise. Lead with the point. Avoid unnecessary hedges while remaining courteous.',
  structured:
    'Organize information clearly (steps, lists where helpful). Prefer precise, unambiguous wording.',
});

/**
 * @param {string|null|undefined} style
 * @returns {'polite'|'formal'|'friendly'|'direct'|'structured'}
 */
export function normalizeCommunicationStyle(style) {
  if (COMMUNICATION_STYLES.includes(/** @type {string} */ (style))) {
    return /** @type {'polite'|'formal'|'friendly'|'direct'|'structured'} */ (style);
  }
  return 'friendly';
}

/**
 * @param {object} input
 * @param {string} [input.region]
 * @param {string} [input.language]
 * @param {string} [input.communicationStyle]
 * @param {string} [input.brandTone]  e.g. luxury, friendly, minimal, bold
 */
export function resolveCulturalAdaptation(input = {}) {
  const region = input.region ? getRegion(input.region) : null;
  const language = normalizeLanguageCode(input.language) || region?.defaultLanguage || 'en';
  const langDef = getLanguage(language);
  const communicationStyle = normalizeCommunicationStyle(
    input.communicationStyle || region?.communicationStyle,
  );

  return Object.freeze({
    language,
    languageName: langDef?.name || language,
    region: region?.id || null,
    regionName: region?.name || null,
    communicationStyle,
    brandTone: input.brandTone ? String(input.brandTone) : null,
    currency: region?.currency || null,
    dateFormat: region?.dateFormat || null,
    measurementUnits: region?.measurementUnits || null,
    guidance: STYLE_GUIDANCE[communicationStyle],
  });
}

/**
 * LLM instruction fragment (empty string when English+friendly with no extras — still returns style note if non-default).
 * @param {ReturnType<typeof resolveCulturalAdaptation>|object} adaptation
 * @returns {string}
 */
export function culturalAdaptationInstruction(adaptation) {
  const a =
    adaptation && adaptation.communicationStyle
      ? adaptation
      : resolveCulturalAdaptation(adaptation || {});

  const parts = [
    `Communication style: ${a.communicationStyle}. ${a.guidance}`,
  ];
  if (a.languageName) {
    parts.push(`Respond in ${a.languageName} unless the user explicitly requests another language.`);
  }
  if (a.brandTone) {
    parts.push(`Align with brand tone: ${a.brandTone}.`);
  }
  if (a.regionName) {
    parts.push(`Regional context: ${a.regionName}.`);
  }
  return `\nCULTURAL ADAPTATION:\n- ${parts.join('\n- ')}\n`;
}
