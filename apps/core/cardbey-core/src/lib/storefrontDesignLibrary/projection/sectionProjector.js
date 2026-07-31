/**
 * Project a single blueprint section (or synthetic placement section).
 */

import { freezeProjectedSection } from './projectionResult.js';
import { selectSectionVariant } from './sectionVariantSelector.js';
import { passesConfidenceThreshold } from './projectionEvidence.js';
import { isForbiddenPlacement } from './contentRoleMapper.js';

/** Content roles that feed each section role. */
export const SECTION_CONTENT_ROLES = Object.freeze({
  service_categories: ['service_category'],
  services: ['service'],
  products: ['product', 'product_category'],
  menu: ['menu_item', 'menu_category'],
  projects: ['project'],
  gallery: ['gallery'],
  testimonials: ['testimonial'],
  trust: ['trust_content'],
  about: ['about'],
  contact: ['contact'],
  location: ['location'],
  service_area: ['location'],
  policies: ['policy'],
  footer: ['career', 'blog', 'support'],
  featured_items: ['product', 'service', 'menu_item'],
  process: [],
  offers: [],
  brands: [],
  booking: [],
  quote: [],
  hero: [],
  hours: [],
  _unknown_review: ['unknown'],
});

/** CTA annotations by primary action → section roles. */
export const CTA_SECTION_HINTS = Object.freeze({
  request_quote: ['hero', 'services', 'service_categories', 'quote', 'footer', 'contact'],
  book: ['hero', 'services', 'booking', 'footer'],
  buy: ['products', 'featured_items'],
  add_to_cart: ['products'],
  order: ['hero', 'menu', 'booking'],
  reserve: ['hero', 'menu', 'booking'],
  call: ['hero', 'contact', 'footer'],
  enquire: ['hero', 'contact', 'footer'],
});

/**
 * @param {import('../contracts/blueprint.js').BlueprintSectionDefinition} sectionDef
 * @param {import('./projectionEvidence.js').ProjectionEvidence} evidence
 * @param {import('./projectionResult.js').ProjectionWarning[]} warnings
 * @returns {import('./projectionResult.js').ProjectedStorefrontSection}
 */
export function projectBlueprintSection(sectionDef, evidence, warnings) {
  const role = sectionDef.role;
  const acceptedRoles = SECTION_CONTENT_ROLES[role] ?? [];
  const matched = [];

  for (const item of evidence.items) {
    if (!acceptedRoles.includes(item.contentRole)) continue;
    if (isForbiddenPlacement(item.contentRole, role)) {
      warnings.push({
        code: 'UNMAPPED_CONTENT_ROLE',
        sectionRole: role,
        itemRef: item.ref,
        detail: `forbidden placement of ${item.contentRole} into ${role}`,
      });
      continue;
    }
    if (!passesConfidenceThreshold(item)) {
      warnings.push({
        code: 'LOW_CONFIDENCE_CLASSIFICATION',
        sectionRole: role,
        itemRef: item.ref,
        detail: `confidence ${item.roleConfidence}`,
      });
      continue;
    }
    matched.push(item);
  }

  // Preserve source order
  matched.sort((a, b) => a.index - b.index);

  const itemRefs = matched.map((m) => m.ref);
  const origin = resolveSectionOrigin(matched);
  const requiresOwnerReview =
    matched.some((m) => m.needsOwnerReview) ||
    (evidence.pendingOwnerReview && matched.length > 0);

  const { visibility, fallbackUsed } = resolveVisibility({
    sectionDef,
    role,
    itemCount: matched.length,
    origin,
    evidence,
  });

  if (visibility === 'visible' && matched.length === 0 && !isStructuralSection(role)) {
    warnings.push({
      code: 'SECTION_EMPTY_AFTER_FILTERING',
      sectionRole: role,
      detail: 'no matching content after filters',
    });
  }

  if ((origin === 'suggested' || origin === 'mixed') && matched.length > 0) {
    warnings.push({
      code: 'SUGGESTED_CONTENT_USED',
      sectionRole: role,
      detail: `${matched.length} item(s); origin=${origin}`,
    });
  }

  if (requiresOwnerReview) {
    warnings.push({
      code: 'OWNER_REVIEW_REQUIRED',
      sectionRole: role,
    });
  }

  // Required data check
  const requiredData = sectionDef.requiredData ?? [];
  for (const key of requiredData) {
    if (key === 'businessName' && !evidence.businessName) {
      warnings.push({
        code: 'MISSING_REQUIRED_SECTION_DATA',
        sectionRole: role,
        detail: 'businessName',
      });
    }
  }

  const hasMedia =
    role === 'gallery' || role === 'projects'
      ? evidence.hasMedia || matched.length > 0
      : evidence.hasMedia;

  const variantPick = selectSectionVariant(role, {
    itemCount: matched.length,
    hasMedia,
    contentOrigin: origin,
    supportedVariants: sectionDef.supportedVariants,
    defaultVariant: sectionDef.defaultVariant,
  });

  const preferredActions = actionsForSection(role, evidence);
  const groups = buildServiceGroups(role, matched);

  /** @type {Record<string, unknown>} */
  const metadata = {
    variantReason: variantPick.reason,
    preferredActions,
    fallbackBehavior: sectionDef.fallbackBehavior,
  };
  if (groups) metadata.groups = groups;

  let finalVisibility = visibility;
  // Gallery/projects: no media and no items → hidden
  if ((role === 'gallery' || role === 'projects') && matched.length === 0 && !evidence.hasMedia) {
    finalVisibility = 'hidden';
  }
  // Hours / location / service_area without evidence
  if (role === 'hours' && !evidence.hasHoursEvidence && matched.length === 0) {
    finalVisibility = sectionDef.fallbackBehavior === 'hide' ? 'hidden' : 'collapsed';
  }
  if ((role === 'location' || role === 'service_area') && !evidence.hasLocationEvidence && matched.length === 0) {
    finalVisibility = sectionDef.fallbackBehavior === 'hide' ? 'hidden' : 'collapsed';
  }
  if (role === 'booking' && !evidence.hasBookingEvidence && matched.length === 0) {
    finalVisibility =
      sectionDef.fallbackBehavior === 'request_input' ? 'visible' : 'collapsed';
  }

  return freezeProjectedSection({
    id: `section:${role}`,
    role,
    variant: variantPick.variant,
    priority: sectionDef.defaultPriority,
    itemRefs: finalVisibility === 'hidden' ? [] : itemRefs,
    visibility: finalVisibility,
    contentOrigin: matched.length === 0 ? 'none' : origin,
    requiresOwnerReview,
    fallbackUsed,
    metadata,
  });
}

/**
 * Synthetic policies section (footer_only).
 * @param {import('./projectionEvidence.js').ProjectionEvidence} evidence
 * @param {import('./projectionResult.js').ProjectionWarning[]} warnings
 */
export function projectPoliciesSection(evidence, warnings) {
  const matched = evidence.items
    .filter((i) => i.contentRole === 'policy' && passesConfidenceThreshold(i))
    .sort((a, b) => a.index - b.index);
  if (matched.length === 0) return null;

  const origin = resolveSectionOrigin(matched);
  if (origin === 'suggested') {
    warnings.push({ code: 'SUGGESTED_CONTENT_USED', sectionRole: 'policies' });
  }
  const requiresOwnerReview = matched.some((m) => m.needsOwnerReview);
  if (requiresOwnerReview) {
    warnings.push({ code: 'OWNER_REVIEW_REQUIRED', sectionRole: 'policies' });
  }

  const variantPick = selectSectionVariant('policies', {
    itemCount: matched.length,
    supportedVariants: ['link-list', 'default'],
    defaultVariant: 'link-list',
  });

  return freezeProjectedSection({
    id: 'section:policies',
    role: 'policies',
    variant: variantPick.variant,
    priority: 95,
    itemRefs: matched.map((m) => m.ref),
    visibility: 'footer_only',
    contentOrigin: origin,
    requiresOwnerReview,
    fallbackUsed: false,
    metadata: { preferredActions: [], placement: 'footer_only' },
  });
}

/**
 * @param {string} role
 * @returns {boolean}
 */
function isStructuralSection(role) {
  return ['hero', 'quote', 'booking', 'contact', 'footer', 'hours'].includes(role);
}

/**
 * @param {{
 *   sectionDef: import('../contracts/blueprint.js').BlueprintSectionDefinition,
 *   role: string,
 *   itemCount: number,
 *   origin: string,
 *   evidence: import('./projectionEvidence.js').ProjectionEvidence,
 * }} args
 */
function resolveVisibility(args) {
  const { sectionDef, role, itemCount, origin, evidence } = args;
  const fb = sectionDef.fallbackBehavior ?? 'hide';

  // Structural always-on (with required data soft)
  if (role === 'hero') {
    return {
      visibility: evidence.businessName || fb === 'request_input' ? 'visible' : 'collapsed',
      fallbackUsed: !evidence.businessName,
    };
  }
  if (role === 'quote' || role === 'contact') {
    return { visibility: 'visible', fallbackUsed: false };
  }
  if (role === 'footer') {
    return { visibility: 'visible', fallbackUsed: false };
  }
  if (role === 'booking' && evidence.hasBookingEvidence) {
    return { visibility: 'visible', fallbackUsed: false };
  }

  if (itemCount > 0) {
    // Suggested-only: only if fallback allows
    if (origin === 'suggested' && fb !== 'allow_suggested' && fb !== 'request_input') {
      if (fb === 'collapse') return { visibility: 'collapsed', fallbackUsed: true };
      return { visibility: 'hidden', fallbackUsed: true };
    }
    return { visibility: 'visible', fallbackUsed: false };
  }

  // Empty optional sections
  if (fb === 'hide') return { visibility: 'hidden', fallbackUsed: true };
  if (fb === 'collapse') return { visibility: 'collapsed', fallbackUsed: true };
  if (fb === 'request_input') return { visibility: 'visible', fallbackUsed: true };
  if (fb === 'allow_suggested') return { visibility: 'collapsed', fallbackUsed: true };
  return { visibility: 'hidden', fallbackUsed: true };
}

/**
 * @param {import('./projectionEvidence.js').ProjectionItem[]} matched
 */
function resolveSectionOrigin(matched) {
  if (!matched.length) return 'none';
  const origins = new Set(matched.map((m) => m.contentOrigin));
  const hasSourced = origins.has('sourced');
  const hasSuggested = origins.has('suggested');
  if (hasSourced && hasSuggested) return 'mixed';
  if (hasSuggested) return 'suggested';
  if (hasSourced) return 'sourced';
  return 'mixed';
}

/**
 * @param {string} role
 * @param {import('./projectionEvidence.js').ProjectionEvidence} evidence
 */
function actionsForSection(role, evidence) {
  /** @type {string[]} */
  const actions = [];
  const primary = evidence.primaryAction;
  const secondary = evidence.secondaryActions[0];
  const primaryHints = CTA_SECTION_HINTS[primary] ?? [];
  if (primaryHints.includes(role)) actions.push(primary);
  if (secondary) {
    const secHints = CTA_SECTION_HINTS[secondary] ?? [];
    if (secHints.includes(role)) actions.push(secondary);
  }
  return actions;
}

/**
 * @param {string} role
 * @param {import('./projectionEvidence.js').ProjectionItem[]} matched
 */
function buildServiceGroups(role, matched) {
  if (role !== 'service_categories' && role !== 'services') return null;
  const keyed = matched.filter((m) => m.groupKey);
  if (keyed.length < 2) return null;
  /** @type {Record<string, string[]>} */
  const groups = {};
  for (const m of matched) {
    const key = m.groupKey || 'Services';
    if (!groups[key]) groups[key] = [];
    groups[key].push(m.ref);
  }
  // Never use "Other" — unmatched → Services
  return groups;
}

/**
 * Attach career/blog/support refs onto footer section.
 * @param {import('./projectionResult.js').ProjectedStorefrontSection} footer
 * @param {import('./projectionEvidence.js').ProjectionEvidence} evidence
 */
export function enrichFooterSection(footer, evidence) {
  const footerRoles = new Set(['career', 'blog', 'support']);
  const refs = evidence.items
    .filter((i) => footerRoles.has(i.contentRole) && passesConfidenceThreshold(i))
    .sort((a, b) => a.index - b.index)
    .map((i) => i.ref);

  if (!refs.length) return footer;

  return freezeProjectedSection({
    ...footer,
    itemRefs: Object.freeze([...new Set([...footer.itemRefs, ...refs])]),
    contentOrigin:
      footer.contentOrigin === 'none'
        ? resolveSectionOrigin(
            evidence.items.filter((i) => footerRoles.has(i.contentRole)),
          )
        : footer.contentOrigin,
    metadata: {
      ...(footer.metadata ?? {}),
      footerOnlyRoles: ['career', 'blog', 'support'],
      careerPlacement: 'footer_only',
    },
  });
}
