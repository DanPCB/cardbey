/**
 * Phase 2 — STORE_WEBSITE ContentTemplate → draft preview foundation (theme + section order).
 *
 * Data flow (do not invent a parallel path):
 *   selectedWebsiteTemplateStore
 *     → intake extras (websiteTemplateId / baseWebsiteTemplate*)
 *     → create_store / fresh draft body + mission.metadataJson + draft.input
 *     → resolveWebsiteTemplateFoundation → mergeWebsiteIntoPreview
 *
 * Adaptive (no websiteTemplateId): callers skip this; mergeWebsiteIntoPreview stays heuristic.
 * Invalid / unloadable template: warn and return null (continue Adaptive).
 */

/** @typedef {'minimal'|'bold'|'editorial'|'warm'|'dark'} LegacyThemeId */

/**
 * Distinctive section orders per preview slug (when layoutDefinition is empty).
 * Default Adaptive order is hero → usp_bar → show → social_proof → about → contact.
 */
const SLUG_SECTION_ORDER = {
  'beauty-wellness-website': ['hero', 'usp_bar', 'about', 'show', 'social_proof', 'contact'],
  'restaurant-cafe-website': ['hero', 'show', 'usp_bar', 'about', 'social_proof', 'contact'],
  'retail-store-website': ['hero', 'usp_bar', 'show', 'social_proof', 'about', 'contact'],
  'professional-services-website': ['hero', 'about', 'usp_bar', 'show', 'social_proof', 'contact'],
  'trades-home-services-website': ['hero', 'usp_bar', 'about', 'contact', 'show', 'social_proof'],
  'travel-business-website': ['hero', 'show', 'about', 'usp_bar', 'social_proof', 'contact'],
  'minimal-seller-storefront': ['hero', 'show', 'about', 'contact'],
};

/** @type {Record<string, { primary: string, secondary: string, templateId: LegacyThemeId, fontFamily?: string }>} */
const SLUG_THEME_DEFAULTS = {
  'beauty-wellness-website': {
    primary: '#db2777',
    secondary: '#fce7f3',
    templateId: 'minimal',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  'restaurant-cafe-website': {
    primary: '#c2410c',
    secondary: '#ffedd5',
    templateId: 'warm',
  },
  'retail-store-website': {
    primary: '#2563eb',
    secondary: '#dbeafe',
    templateId: 'minimal',
  },
  'professional-services-website': {
    primary: '#0f766e',
    secondary: '#ccfbf1',
    templateId: 'minimal',
  },
  'trades-home-services-website': {
    primary: '#b45309',
    secondary: '#fef3c7',
    templateId: 'bold',
  },
  'travel-business-website': {
    primary: '#0369a1',
    secondary: '#e0f2fe',
    templateId: 'editorial',
  },
  'minimal-seller-storefront': {
    primary: '#525252',
    secondary: '#f5f5f5',
    templateId: 'minimal',
  },
};

const CANONICAL_SECTION_TYPES = new Set([
  'hero',
  'usp_bar',
  'show',
  'about',
  'social_proof',
  'contact',
]);

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return /** @type {Record<string, unknown>} */ (value);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Map template layout section type → WebsitePreview section type.
 * @param {string} raw
 * @returns {string | null}
 */
export function mapLayoutSectionType(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!t) return null;
  if (CANONICAL_SECTION_TYPES.has(t)) return t;
  if (t === 'usp' || t === 'features' || t === 'benefits') return 'usp_bar';
  if (
    t === 'products' ||
    t === 'catalog' ||
    t === 'services' ||
    t === 'menu' ||
    t === 'featured' ||
    t === 'gallery'
  ) {
    return 'show';
  }
  if (t === 'story' || t === 'bio') return 'about';
  if (t === 'testimonials' || t === 'reviews' || t === 'proof') return 'social_proof';
  if (t === 'location' || t === 'visit' || t === 'footer_contact') return 'contact';
  return null;
}

/**
 * @param {unknown} layoutDefinition
 * @param {string} [slug]
 * @returns {string[]}
 */
export function resolveSectionOrderFromLayout(layoutDefinition, slug = '') {
  const layout = parseJsonObject(layoutDefinition);
  const rawSections = Array.isArray(layout?.sections) ? layout.sections : [];
  /** @type {string[]} */
  const ordered = [];
  const seen = new Set();
  const sorted = [...rawSections].sort((a, b) => {
    const ao = typeof a?.order === 'number' ? a.order : 0;
    const bo = typeof b?.order === 'number' ? b.order : 0;
    return ao - bo;
  });
  for (const sec of sorted) {
    const mapped = mapLayoutSectionType(sec?.type ?? sec?.id ?? '');
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    ordered.push(mapped);
  }
  if (ordered.length > 0) {
    for (const required of ['hero', 'contact']) {
      if (!seen.has(required)) {
        if (required === 'hero') ordered.unshift('hero');
        else ordered.push(required);
      }
    }
    return ordered;
  }
  const slugKey = String(slug || '').trim().toLowerCase();
  if (slugKey && SLUG_SECTION_ORDER[slugKey]) return [...SLUG_SECTION_ORDER[slugKey]];
  return [];
}

/**
 * @param {unknown} themeDefinition
 * @param {string} [slug]
 * @returns {{ primary: string, secondary: string, templateId: LegacyThemeId, fontFamily?: string }}
 */
export function resolveThemeTokensFromDefinition(themeDefinition, slug = '') {
  const slugKey = String(slug || '').trim().toLowerCase();
  const fallback = SLUG_THEME_DEFAULTS[slugKey] || {
    primary: '#1a1a2e',
    secondary: '#ffcc00',
    templateId: /** @type {LegacyThemeId} */ ('warm'),
  };
  const theme = parseJsonObject(themeDefinition) || {};
  const primary =
    String(theme.primaryColor ?? theme.primary ?? theme.brandPrimary ?? '').trim() || fallback.primary;
  const secondary =
    String(theme.secondaryColor ?? theme.secondary ?? theme.brandSecondary ?? '').trim() ||
    fallback.secondary;
  const fontFamily = String(theme.fontFamily ?? theme.font ?? '').trim() || fallback.fontFamily;
  const legacyRaw = String(theme.templateId ?? theme.legacyTemplateId ?? theme.style ?? '')
    .trim()
    .toLowerCase();
  /** @type {LegacyThemeId} */
  let templateId = fallback.templateId;
  if (['minimal', 'bold', 'editorial', 'warm', 'dark'].includes(legacyRaw)) {
    templateId = /** @type {LegacyThemeId} */ (legacyRaw);
  }
  return {
    primary,
    secondary,
    templateId,
    ...(fontFamily ? { fontFamily } : {}),
  };
}

/**
 * Load ContentTemplate + version; build foundation tokens. Never throws to callers.
 *
 * @param {string | null | undefined} websiteTemplateId
 * @param {{ slug?: string | null, industry?: string | null }} [hints]
 * @returns {Promise<object | null>}
 */
export async function resolveWebsiteTemplateFoundation(websiteTemplateId, hints = {}) {
  const id = typeof websiteTemplateId === 'string' ? websiteTemplateId.trim() : '';
  if (!id) return null;

  try {
    const { getPrismaClient } = await import('../../lib/prisma.js');
    const prisma = getPrismaClient();
    const template = await prisma.contentTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        industry: true,
        contentType: true,
        status: true,
        currentVersionId: true,
      },
    });

    if (!template) {
      console.warn('[websiteTemplateFoundation] template not found — Adaptive fallback', { id });
      return null;
    }
    if (String(template.contentType || '').toUpperCase() !== 'STORE_WEBSITE') {
      console.warn('[websiteTemplateFoundation] not STORE_WEBSITE — Adaptive fallback', {
        id,
        contentType: template.contentType,
      });
      return null;
    }

    let version = null;
    if (template.currentVersionId) {
      version = await prisma.contentTemplateVersion.findUnique({
        where: { id: template.currentVersionId },
        select: { themeDefinition: true, layoutDefinition: true, versionNumber: true },
      });
    }
    if (!version) {
      version = await prisma.contentTemplateVersion.findFirst({
        where: { templateId: id },
        orderBy: { versionNumber: 'desc' },
        select: { themeDefinition: true, layoutDefinition: true, versionNumber: true },
      });
    }

    const slug = String(template.slug || hints.slug || '').trim();
    const theme = resolveThemeTokensFromDefinition(version?.themeDefinition, slug);
    const sectionOrder = resolveSectionOrderFromLayout(version?.layoutDefinition, slug);

    return {
      websiteTemplateId: template.id,
      slug,
      name: template.name || null,
      industry: template.industry || hints.industry || null,
      theme,
      sectionOrder: sectionOrder.length > 0 ? sectionOrder : SLUG_SECTION_ORDER[slug] || [],
      source: 'content_template',
    };
  } catch (err) {
    console.warn(
      '[websiteTemplateFoundation] load failed — Adaptive fallback:',
      err?.message || err,
    );
    return null;
  }
}

/**
 * Ensure draft.input carries a resolved foundation (or Adaptive null). Non-fatal.
 *
 * @param {Record<string, unknown>} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function ensureWebsiteTemplateFoundationOnInput(input) {
  const base = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
  const existing = base.websiteTemplateFoundation;
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return base;
  }
  const id = String(base.websiteTemplateId ?? '').trim();
  if (!id) return base;

  const foundation = await resolveWebsiteTemplateFoundation(id, {
    slug: typeof base.websiteTemplateSlug === 'string' ? base.websiteTemplateSlug : null,
    industry: typeof base.websiteTemplateIndustry === 'string' ? base.websiteTemplateIndustry : null,
  });
  if (!foundation) {
    // Keep id for diagnostics; clear so merge behaves as Adaptive
    delete base.websiteTemplateFoundation;
    return base;
  }
  base.websiteTemplateFoundation = foundation;
  if (!base.websiteTemplateSlug && foundation.slug) {
    base.websiteTemplateSlug = foundation.slug;
  }
  return base;
}

/**
 * Reorder built sections + apply theme tokens. Catalog content untouched.
 *
 * @param {object} preview
 * @param {Array<{ type: string, content: Record<string, unknown> }>} sections
 * @param {object | null | undefined} foundation
 * @returns {Array<{ type: string, content: Record<string, unknown> }>}
 */
export function applyFoundationToSectionsAndPreview(preview, sections, foundation) {
  if (!foundation || typeof foundation !== 'object') return sections;

  const theme = foundation.theme && typeof foundation.theme === 'object' ? foundation.theme : null;
  if (theme) {
    preview.brandColors = {
      ...(preview.brandColors && typeof preview.brandColors === 'object' ? preview.brandColors : {}),
      primary: theme.primary || preview.brandColors?.primary,
      secondary: theme.secondary || preview.brandColors?.secondary,
    };
  }

  const order = Array.isArray(foundation.sectionOrder) ? foundation.sectionOrder : [];
  /** @type {Array<{ type: string, content: Record<string, unknown> }>} */
  let next = sections;
  if (order.length > 0) {
    const byType = new Map(sections.map((s) => [s.type, s]));
    /** @type {Array<{ type: string, content: Record<string, unknown> }>} */
    const ordered = [];
    const used = new Set();
    for (const type of order) {
      const sec = byType.get(type);
      if (sec) {
        ordered.push(sec);
        used.add(type);
      }
    }
    for (const sec of sections) {
      if (!used.has(sec.type)) ordered.push(sec);
    }
    next = ordered;
  }

  preview.websiteTemplateId = foundation.websiteTemplateId || preview.websiteTemplateId || null;
  if (foundation.slug) {
    preview.meta = {
      ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
      websiteTemplateSlug: foundation.slug,
      websiteTemplateName: foundation.name || null,
    };
  }

  return next;
}

/**
 * Build website.theme patch from foundation (legacy templateId + fonts).
 * @param {object | null | undefined} foundation
 * @param {string} fallbackTemplateId
 */
export function themePatchFromFoundation(foundation, fallbackTemplateId) {
  const theme = foundation?.theme && typeof foundation.theme === 'object' ? foundation.theme : null;
  if (!theme) {
    return { templateId: fallbackTemplateId };
  }
  return {
    templateId: theme.templateId || fallbackTemplateId,
    ...(theme.fontFamily ? { fontFamily: theme.fontFamily } : {}),
    ...(theme.primary ? { primaryColor: theme.primary } : {}),
    ...(theme.secondary ? { secondaryColor: theme.secondary } : {}),
  };
}
