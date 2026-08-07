/**
 * Canonical sourced-content envelope (runtime, additive — not a new DB).
 * Consolidates research + BusinessContentRole before catalog/media corruption.
 */

import { mapContentRoleToSection } from '../storefrontDesignLibrary/projection/contentRoleMapper.js';
import { isBusinessContentRole } from '../storefrontDesignLibrary/contracts/contentRole.js';

export const CANONICAL_SOURCED_CONTENT_VERSION = 1;

/** Roles allowed into offering / catalog / product-image generation. */
export const OFFERING_CONTENT_ROLES = Object.freeze([
  'product',
  'product_category',
  'service',
  'service_category',
  'menu_item',
  'menu_category',
]);

const OFFERING_ROLE_SET = new Set(OFFERING_CONTENT_ROLES);

/** Roles that must never enter catalog or product-image generation. */
export const NON_OFFERING_CONTENT_ROLES = Object.freeze([
  'testimonial',
  'trust_content',
  'policy',
  'career',
  'about',
  'contact',
  'location',
  'navigation',
  'support',
  'blog',
  'unknown',
  'gallery',
  'project',
]);

const SECTION_BUCKETS = Object.freeze([
  'testimonial',
  'trust_content',
  'policy',
  'career',
  'about',
  'contact',
  'location',
  'gallery',
  'project',
]);

/**
 * @param {unknown} role
 * @returns {boolean}
 */
export function isOfferingContentRole(role) {
  return typeof role === 'string' && OFFERING_ROLE_SET.has(role);
}

/**
 * @param {unknown} role
 * @returns {boolean}
 */
export function isNonOfferingContentRole(role) {
  if (typeof role !== 'string' || !role.trim()) return false;
  if (OFFERING_ROLE_SET.has(role)) return false;
  return NON_OFFERING_CONTENT_ROLES.includes(role) || isBusinessContentRole(role);
}

/**
 * @param {unknown} item
 * @returns {string}
 */
export function resolveItemContentRole(item) {
  if (!item || typeof item !== 'object') return 'unknown';
  const role = String(item.contentRole ?? item.role ?? item.type ?? '').trim();
  if (isBusinessContentRole(role)) return role;
  if (role === 'service_category' || role === 'product_category') return role;
  return 'unknown';
}

/**
 * @param {unknown} item
 * @param {number} index
 */
function toContentRef(item, index) {
  const row = item && typeof item === 'object' ? item : {};
  const id =
    String(row.id ?? row.productId ?? row.ref ?? '').trim() || `sourced_ref_${index}`;
  return {
    id,
    name: String(row.name ?? row.title ?? '').trim() || null,
    contentRole: resolveItemContentRole(row),
    sourceUrl: String(row.sourceUrl ?? row.url ?? row.researchMeta?.sourceUrl ?? '').trim() || null,
    contentOrigin: row.contentOrigin === 'suggested' ? 'suggested' : 'sourced',
    confidence: Number.isFinite(Number(row.roleConfidence ?? row.confidence))
      ? Number(row.roleConfidence ?? row.confidence)
      : null,
    needsOwnerReview: Boolean(row.needsOwnerReview),
    sourceParentId: row.sourceParentId != null ? String(row.sourceParentId) : row.parentId != null ? String(row.parentId) : null,
    sourcePath: String(row.sourcePath ?? row.url ?? '').trim() || null,
    sourceOrder: Number.isFinite(Number(row.sourceOrder)) ? Number(row.sourceOrder) : index,
  };
}

/**
 * Build additive canonical envelope from classified research products + facts.
 *
 * @param {{
 *   products?: unknown[],
 *   facts?: Record<string, unknown> | null,
 *   research?: Record<string, unknown> | null,
 *   profile?: Record<string, unknown> | null,
 *   catalogAuthority?: string | null,
 * }} [input]
 */
export function buildCanonicalSourcedBusinessContent(input = {}) {
  const products = Array.isArray(input.products) ? input.products : [];
  const facts = input.facts && typeof input.facts === 'object' ? input.facts : {};
  const research = input.research && typeof input.research === 'object' ? input.research : {};
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};

  /** @type {Record<string, ReturnType<typeof toContentRef>[]>} */
  const sections = Object.fromEntries(SECTION_BUCKETS.map((k) => [k, []]));
  /** @type {object[]} */
  const offerings = [];
  /** @type {object[]} */
  const excludedFromCatalog = [];

  products.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const role = resolveItemContentRole(raw);
    const ref = toContentRef(raw, index);

    if (isOfferingContentRole(role)) {
      offerings.push({
        id: ref.id,
        name: ref.name ?? `Item ${index + 1}`,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        role,
        sourceUrl: ref.sourceUrl ?? undefined,
        contentOrigin: ref.contentOrigin,
        confidence: ref.confidence ?? undefined,
        needsOwnerReview: ref.needsOwnerReview,
        price: raw.price ?? null,
        currency: raw.currency ?? null,
        sourceParentId: ref.sourceParentId,
        sourcePath: ref.sourcePath,
        sourceOrder: ref.sourceOrder,
        categoryId: raw.categoryId ?? null,
        category: raw.category ?? raw.categoryName ?? null,
        mediaCandidates: Array.isArray(raw.mediaCandidates) ? raw.mediaCandidates : undefined,
        _raw: raw,
      });
      return;
    }

    excludedFromCatalog.push(ref);
    if (Object.prototype.hasOwnProperty.call(sections, role)) {
      sections[role].push(ref);
    } else if (role === 'trust_content') {
      sections.trust_content.push(ref);
    } else {
      // Route unknown/blog/support/nav via closest bucket for diagnostics
      const mapped = mapContentRoleToSection(role);
      if (mapped === 'testimonials') sections.testimonial.push(ref);
      else if (mapped === 'trust') sections.trust_content.push(ref);
      else if (mapped === 'policies') sections.policy.push(ref);
      else if (mapped === 'footer' && role === 'career') sections.career.push(ref);
      else if (mapped === 'about') sections.about.push(ref);
      else if (mapped === 'contact') sections.contact.push(ref);
      else if (mapped === 'location' || mapped === 'service_area') sections.location.push(ref);
      else if (mapped === 'gallery') sections.gallery.push(ref);
      else if (mapped === 'projects') sections.project.push(ref);
    }
  });

  const pickFact = (key) => {
    const f = facts[key];
    if (f && typeof f === 'object' && 'value' in f) return f.value != null ? String(f.value) : null;
    if (typeof f === 'string' && f.trim()) return f.trim();
    return null;
  };

  return {
    identity: {
      name:
        pickFact('businessName') ||
        (typeof profile.name === 'string' ? profile.name : null) ||
        (typeof research.businessName === 'string' ? research.businessName : null),
      category: pickFact('category') || (typeof profile.type === 'string' ? profile.type : null),
      address: pickFact('address') || (typeof profile.address === 'string' ? profile.address : null),
      phone: pickFact('phone') || (typeof profile.phone === 'string' ? profile.phone : null),
      website: pickFact('website') || (typeof profile.website === 'string' ? profile.website : null),
    },
    offerings,
    sections,
    evidence: Array.isArray(research.sourcesUsed) ? research.sourcesUsed : [],
    sourceSummary: {
      catalogAuthority: input.catalogAuthority ?? null,
      offeringCount: offerings.length,
      nonOfferingCount: excludedFromCatalog.length,
      roleCounts: countRoles(products),
    },
    excludedFromCatalog,
    version: CANONICAL_SOURCED_CONTENT_VERSION,
  };
}

function countRoles(products) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const p of products) {
    const role = resolveItemContentRole(p);
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

/**
 * Split classified products into offering catalog rows vs section refs.
 * Non-offerings are excluded from catalog (fail-safe: never crash).
 *
 * @param {unknown[]} products
 * @returns {{ offerings: object[], nonOfferings: object[], envelope: ReturnType<typeof buildCanonicalSourcedBusinessContent>, diagnostics: object }}
 */
export function splitSourcedProductsByRole(products, context = {}) {
  const list = Array.isArray(products) ? products.filter((p) => p && typeof p === 'object') : [];
  const offerings = [];
  const nonOfferings = [];
  for (const item of list) {
    const role = resolveItemContentRole(item);
    if (isOfferingContentRole(role)) offerings.push(item);
    else nonOfferings.push(item);
  }
  const envelope = buildCanonicalSourcedBusinessContent({
    products: list,
    facts: context.facts,
    research: context.research,
    profile: context.profile,
    catalogAuthority: context.catalogAuthority,
  });
  return {
    offerings,
    nonOfferings,
    envelope,
    diagnostics: {
      total: list.length,
      offeringCount: offerings.length,
      nonOfferingCount: nonOfferings.length,
      excludedRoles: nonOfferings.map((i) => resolveItemContentRole(i)),
    },
  };
}

/**
 * Hard invariant: catalog products must not contain non-offering roles.
 * Production: exclude + diagnose (do not throw). Tests may set throwOnViolation.
 *
 * @param {unknown[]} items
 * @param {{ throwOnViolation?: boolean, log?: boolean }} [opts]
 */
export function assertNoNonOfferingRolesInCatalog(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const offenders = [];
  const cleaned = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    // Flag-off / legacy rows without classification stay in catalog.
    if (item.contentRole == null || item.contentRole === '') {
      cleaned.push(item);
      continue;
    }
    const role = resolveItemContentRole(item);
    if (isOfferingContentRole(role)) {
      cleaned.push(item);
      continue;
    }
    offenders.push({ id: item.id, name: item.name, contentRole: role });
  }

  const diagnostic = {
    event: 'catalog.non_offering_role_excluded',
    offenderCount: offenders.length,
    offenders: offenders.slice(0, 20),
  };

  if (offenders.length && (opts.log !== false)) {
    if (process.env.NODE_ENV !== 'production' || process.env.LOG_CATALOG_ROLE_INVARIANT === '1') {
      try {
        console.warn('[canonicalSourcedContent]', JSON.stringify(diagnostic));
      } catch {
        /* ignore */
      }
    }
  }

  if (offenders.length && opts.throwOnViolation) {
    throw new Error(
      `assertNoNonOfferingRolesInCatalog: ${offenders.length} non-offering row(s) in catalog`,
    );
  }

  return { ok: offenders.length === 0, items: cleaned, offenders, diagnostic };
}

/**
 * Rebuild preview.categories from item category names so normalize cannot dump to Other.
 * @param {object} preview
 */
export function syncCategoriesFromSourcedItems(preview) {
  if (!preview || typeof preview !== 'object') return preview;
  const items = Array.isArray(preview.items) ? preview.items : [];
  if (!items.length) return preview;

  const map = new Map();
  let idx = 0;
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const role = resolveItemContentRole(it);
    // Prefer source hierarchy name for category rows
    let cname =
      String(it.categoryName ?? it.category ?? '').trim() ||
      (role === 'service_category' || role === 'product_category' || role === 'menu_category'
        ? String(it.name ?? '').trim()
        : '');
    if (!cname) cname = role.startsWith('menu') ? 'Menu' : role.startsWith('product') ? 'Products' : 'Services';
    if (!map.has(cname)) {
      const existingId = String(it.categoryId ?? '').trim();
      const id =
        existingId && existingId.toLowerCase() !== 'other' && ![...map.values()].some((c) => c.id === existingId)
          ? existingId
          : `src_cat_${idx++}`;
      map.set(cname, { id, name: cname });
    }
    const cat = map.get(cname);
    it.categoryId = cat.id;
    it.category = cname;
    it.categoryName = cname;
  }
  preview.categories = [...map.values()];
  return preview;
}

/**
 * Whether legacy category normalizer must be skipped for this preview.
 * @param {object|null|undefined} preview
 */
export function shouldBypassLegacyCategoryNormalization(preview) {
  if (!preview || typeof preview !== 'object') return false;
  const meta = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  if (meta.designLibraryStorefrontProjection) return true;
  if (meta.bypassLegacyCategoryNormalization === true) return true;
  const authority = String(meta.catalogAuthority?.selectedAuthority ?? meta.catalogAuthority ?? '').trim();
  if (authority === 'sourced' || authority === 'sourced_pending_review') return true;
  if (meta.contentOrigin === 'sourced' && meta.catalogSource === 'research') return true;
  if (meta.canonicalSourcedContent?.version) return true;
  return false;
}

/**
 * Emit end-to-end authority trace (structured, one event).
 * @param {Record<string, unknown>} payload
 */
export function emitStoreCreationAuthorityTrace(payload) {
  const event = {
    event: 'store.creation.authority_trace',
    ...payload,
    at: new Date().toISOString(),
  };
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_STORE_CREATION_AUTHORITY_TRACE === '1') {
    try {
      console.info('[store.creation.authority_trace]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}
