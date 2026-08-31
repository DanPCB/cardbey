/**
 * Normalize legacy storefront structure for shadow comparison only.
 * Does not mutate the store.
 */

import { LEGACY_EXTRACTOR_VERSION, LEGACY_TYPE_TO_SEMANTIC } from './renderCompatibility.js';

/**
 * @typedef {{
 *   sections: Array<{
 *     rendererType: string,
 *     inferredSemanticRole?: string,
 *     order: number,
 *     itemCount: number,
 *     actions: string[],
 *     itemRoles?: string[],
 *   }>,
 *   themeReference?: string,
 *   websiteTemplateId?: string,
 *   legacyThemeTemplateId?: string,
 *   contentTemplateId?: string,
 *   primaryCtaLabel?: string,
 *   warnings: string[],
 *   extractorVersion: number,
 * }} LegacyStructureSnapshot
 */

/**
 * @param {object} draftOrPublishedStore
 * @returns {LegacyStructureSnapshot}
 */
export function extractLegacyStorefrontStructure(draftOrPublishedStore) {
  const store = draftOrPublishedStore && typeof draftOrPublishedStore === 'object'
    ? draftOrPublishedStore
    : {};
  /** @type {string[]} */
  const warnings = [];

  const website =
    store.preview?.website ??
    store.website ??
    store.miniWebsite ??
    store.stylePreferences?.miniWebsite ??
    {};

  const sectionsRaw = Array.isArray(website.sections)
    ? website.sections
    : Array.isArray(store.miniWebsiteSections)
      ? store.miniWebsiteSections
      : Array.isArray(store.preview?.sections)
        ? store.preview.sections
        : [];

  const products = Array.isArray(store.products)
    ? store.products
    : Array.isArray(store.catalog?.products)
      ? store.catalog.products
      : Array.isArray(store.items)
        ? store.items
        : [];

  /** @type {LegacyStructureSnapshot['sections']} */
  const sections = [];

  if (sectionsRaw.length > 0) {
    sectionsRaw.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') return;
      const type = String(raw.type ?? raw.role ?? raw.key ?? raw.component ?? 'unknown');
      const inferred = LEGACY_TYPE_TO_SEMANTIC[type] ?? inferFromKey(type);
      const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.products) ? raw.products : [];
      const actions = extractActions(raw, store);
      sections.push({
        rendererType: type,
        inferredSemanticRole: inferred,
        order: Number(raw.order ?? raw.priority ?? index + 1) || index + 1,
        itemCount: items.length,
        actions,
        itemRoles: items.map((it) => String(it?.contentRole ?? it?.type ?? 'unknown')),
      });
    });
  } else if (products.length > 0) {
    // Legacy create-store often dumps catalog into a single services band with Book
    const actions = [normalizeLegacyCta(store)];
    const itemRoles = products.map((p) => String(p?.contentRole ?? p?.type ?? 'service'));
    sections.push({
      rendererType: 'service-list',
      inferredSemanticRole: 'services',
      order: 1,
      itemCount: products.length,
      actions,
      itemRoles,
    });
    warnings.push('legacy_flat_catalog_as_services');
  } else {
    warnings.push('no_legacy_sections_or_catalog');
  }

  // Separate naming collision fields intentionally
  const websiteTemplateId =
    store.websiteTemplateId ??
    store.preview?.websiteTemplateId ??
    store.meta?.websiteTemplateId ??
    null;
  const legacyThemeTemplateId =
    website?.theme?.templateId ??
    store.theme?.templateId ??
    store.legacyThemeTemplateId ??
    null;
  const contentTemplateId =
    store.contentTemplateId ??
    store.meta?.contentTemplateId ??
    store.preview?.contentTemplateId ??
    null;

  if (websiteTemplateId && legacyThemeTemplateId && String(websiteTemplateId) === String(legacyThemeTemplateId)) {
    warnings.push('websiteTemplateId_equals_legacyThemeTemplateId_verify_collision');
  }

  return Object.freeze({
    sections: Object.freeze(sections.map((s) => Object.freeze({ ...s, actions: Object.freeze([...s.actions]), itemRoles: Object.freeze([...(s.itemRoles ?? [])]) }))),
    themeReference: store.themeId ?? website?.themeId ?? null,
    websiteTemplateId: websiteTemplateId != null ? String(websiteTemplateId) : undefined,
    legacyThemeTemplateId: legacyThemeTemplateId != null ? String(legacyThemeTemplateId) : undefined,
    contentTemplateId: contentTemplateId != null ? String(contentTemplateId) : undefined,
    primaryCtaLabel: String(
      store.primaryCTA ?? store.meta?.primaryCTA ?? store.preview?.primaryCTA ?? '',
    ).trim() || undefined,
    warnings: Object.freeze(warnings),
    extractorVersion: LEGACY_EXTRACTOR_VERSION,
  });
}

/**
 * @param {string} type
 */
function inferFromKey(type) {
  const t = String(type).toLowerCase();
  if (t.includes('service')) return 'services';
  if (t.includes('product')) return 'products';
  if (t.includes('menu')) return 'menu';
  if (t.includes('testimonial')) return 'testimonials';
  if (t.includes('hero')) return 'hero';
  if (t.includes('footer')) return 'footer';
  if (t.includes('contact')) return 'contact';
  return undefined;
}

/**
 * @param {object} section
 * @param {object} store
 */
function extractActions(section, store) {
  /** @type {string[]} */
  const actions = [];
  const cta = section.cta ?? section.primaryAction ?? section.action;
  if (typeof cta === 'string') actions.push(normalizeActionToken(cta));
  if (Array.isArray(section.actions)) {
    for (const a of section.actions) {
      if (typeof a === 'string') actions.push(normalizeActionToken(a));
      else if (a?.action) actions.push(normalizeActionToken(a.action));
    }
  }
  if (!actions.length) actions.push(normalizeLegacyCta(store));
  return [...new Set(actions.filter(Boolean))];
}

/** @param {object} store */
function normalizeLegacyCta(store) {
  const label = String(store.primaryCTA ?? store.meta?.primaryCTA ?? store.ctaLabel ?? 'Book').trim();
  return normalizeActionToken(label);
}

/** @param {string} token */
function normalizeActionToken(token) {
  const t = String(token).trim().toLowerCase();
  if (!t) return 'enquire';
  if (t.includes('quote') || t.includes('estimate')) return 'request_quote';
  if (t.includes('book')) return 'book';
  if (t.includes('buy') || t === 'purchase') return 'buy';
  if (t.includes('cart')) return 'add_to_cart';
  if (t.includes('order')) return 'order';
  if (t.includes('reserve')) return 'reserve';
  if (t.includes('call')) return 'call';
  if (t.includes('direction')) return 'get_directions';
  if (t.includes('contact')) return 'contact';
  if (t.includes('enquire') || t.includes('inquiry')) return 'enquire';
  return t.replace(/\s+/g, '_');
}
