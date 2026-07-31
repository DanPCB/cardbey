/**
 * Read-only structural adapter: legacy layout / foundation section types
 * → blueprint-compatible section role metadata.
 *
 * Inspection / future migration only — does not change the renderer.
 */

import { isSectionRole } from '../contracts/sectionRole.js';
import { mapLayoutSectionType } from '../../../services/draftStore/websiteTemplateFoundation.js';

/**
 * Map a raw layout section type (seed / ContentTemplateVersion.layoutDefinition)
 * toward a design-library section role when possible.
 *
 * @param {string} rawType
 * @returns {{ role: string | null, legacyWebsiteSectionType: string | null, mapped: boolean }}
 */
export function mapLayoutTypeToBlueprintRole(rawType) {
  const raw = String(rawType ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) {
    return { role: null, legacyWebsiteSectionType: null, mapped: false };
  }

  /** Direct role hits */
  if (isSectionRole(raw)) {
    return { role: raw, legacyWebsiteSectionType: mapLayoutSectionType(raw), mapped: true };
  }

  /** Heuristic role mapping (structural only) */
  /** @type {Record<string, string>} */
  const ROLE_ALIASES = {
    navigation: 'footer',
    nav: 'footer',
    usp: 'trust',
    usp_bar: 'trust',
    features: 'trust',
    benefits: 'trust',
    reviews: 'testimonials',
    social_proof: 'testimonials',
    show: 'gallery',
    catalog: 'products',
    featured: 'featured_items',
    visit_us: 'location',
    footer_links: 'footer',
  };

  const role = ROLE_ALIASES[raw] ?? null;
  const legacyWebsiteSectionType = mapLayoutSectionType(raw);
  return {
    role: role && isSectionRole(role) ? role : null,
    legacyWebsiteSectionType,
    mapped: Boolean(role && isSectionRole(role)),
  };
}

/**
 * @param {unknown} layoutDefinition
 * @returns {{
 *   sections: Array<{
 *     id: string,
 *     legacyType: string,
 *     role: string | null,
 *     legacyWebsiteSectionType: string | null,
 *     order: number,
 *     visible: boolean,
 *   }>,
 *   unmappedTypes: string[],
 * }}
 */
export function adaptLayoutDefinitionToStructuralMetadata(layoutDefinition) {
  const layout =
    layoutDefinition && typeof layoutDefinition === 'object' && !Array.isArray(layoutDefinition)
      ? /** @type {Record<string, unknown>} */ (layoutDefinition)
      : null;
  const rawSections = Array.isArray(layout?.sections) ? layout.sections : [];
  const sections = [];
  const unmappedTypes = [];

  rawSections.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const e = /** @type {Record<string, unknown>} */ (entry);
    const legacyType = String(e.type ?? e.id ?? '').trim();
    const mapped = mapLayoutTypeToBlueprintRole(legacyType);
    if (!mapped.mapped && legacyType) unmappedTypes.push(legacyType);
    sections.push({
      id: String(e.id ?? legacyType ?? `section-${index}`),
      legacyType,
      role: mapped.role,
      legacyWebsiteSectionType: mapped.legacyWebsiteSectionType,
      order: typeof e.order === 'number' ? e.order : index,
      visible: e.visible !== false,
    });
  });

  return { sections, unmappedTypes: [...new Set(unmappedTypes)] };
}
