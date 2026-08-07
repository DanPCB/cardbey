/**
 * Platform-level glossary seeds (never-translate / preferred terms).
 * Store-specific glossaries are registered later per business.
 */

/** @type {import('../contracts/glossaryEntry.js').GlossaryEntry[]} */
export const PLATFORM_GLOSSARY_DEFINITIONS = Object.freeze([
  {
    id: 'platform-cardbey',
    term: 'Cardbey',
    policy: 'never_translate',
    scope: 'platform',
    ownerApproved: true,
    note: 'Brand name',
  },
  {
    id: 'platform-partner-pass',
    term: 'Partner Pass',
    policy: 'never_translate',
    scope: 'platform',
    ownerApproved: true,
  },
  {
    id: 'platform-banh-mi',
    term: 'Bánh mì',
    policy: 'preferred_term',
    sourceLanguage: 'vi',
    scope: 'industry',
    preferredByLanguage: {
      en: 'Vietnamese Bánh Mì',
      vi: 'Bánh mì',
    },
    ownerApproved: true,
    note: 'Do not literal-translate as bread',
  },
]);
