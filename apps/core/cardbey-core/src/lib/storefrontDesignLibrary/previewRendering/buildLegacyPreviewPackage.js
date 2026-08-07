/**
 * Independently renderable legacy preview package (Phase 8A).
 * Does not mutate the draft / store.
 */

import { extractLegacyStorefrontStructure } from '../rendering/legacyStructureExtractor.js';
import { LEGACY_EXTRACTOR_VERSION } from '../rendering/renderCompatibility.js';

export const LEGACY_PREVIEW_PACKAGE_VERSION = 1;

/**
 * @param {object} legacyStore
 * @returns {object|null}
 */
export function buildLegacyPreviewPackage(legacyStore) {
  if (!legacyStore || typeof legacyStore !== 'object') {
    return null;
  }

  const website =
    legacyStore.preview?.website ??
    legacyStore.website ??
    legacyStore.miniWebsite ??
    legacyStore.stylePreferences?.miniWebsite ??
    {};

  const sectionsRaw = Array.isArray(website.sections)
    ? website.sections
    : Array.isArray(legacyStore.preview?.sections)
      ? legacyStore.preview.sections
      : [];

  // Shallow clones only — never mutate source sections/theme objects
  const sections = sectionsRaw.map((s) => (s && typeof s === 'object' ? { ...s } : s));
  const theme =
    website.theme && typeof website.theme === 'object' ? { ...website.theme } : null;

  const structure = extractLegacyStorefrontStructure(legacyStore);

  return Object.freeze({
    kind: 'legacy_preview_package',
    packageVersion: LEGACY_PREVIEW_PACKAGE_VERSION,
    source: /** @type {const} */ ('legacy'),
    authoritative: false,
    render: Object.freeze({
      sections: Object.freeze(sections),
      theme: theme ? Object.freeze(theme) : null,
      websiteTemplateId: structure.websiteTemplateId ?? legacyStore.websiteTemplateId ?? null,
      contentTemplateId: structure.contentTemplateId ?? legacyStore.contentTemplateId ?? null,
      legacyThemeTemplateId: structure.legacyThemeTemplateId ?? null,
      primaryCTA:
        structure.primaryCtaLabel ??
        legacyStore.primaryCTA ??
        legacyStore.meta?.primaryCTA ??
        legacyStore.preview?.primaryCTA ??
        null,
    }),
    structure,
    extractorVersion: structure.extractorVersion ?? LEGACY_EXTRACTOR_VERSION,
  });
}
