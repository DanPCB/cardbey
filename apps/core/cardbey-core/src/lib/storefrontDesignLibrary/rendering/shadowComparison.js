/**
 * Compare legacy storefront structure vs projected render view model.
 */

import { freezeShadowComparison, SHADOW_COMPARISON_VERSION } from './shadowComparisonResult.js';

/**
 * @param {{
 *   legacySnapshot: import('./legacyStructureExtractor.js').LegacyStructureSnapshot,
 *   projectedViewModel: object,
 *   catalogItems?: unknown[],
 * }} input
 */
export function compareLegacyAndProjectedStorefront(input) {
  const legacy = input.legacySnapshot;
  const projected = input.projectedViewModel;
  const catalogItems = Array.isArray(input.catalogItems) ? input.catalogItems : [];

  /** @type {import('./shadowComparisonResult.js').ComparisonFinding[]} */
  const criticalFindings = [];
  /** @type {Array<Record<string, unknown>>} */
  const sectionDiffs = [];
  /** @type {Array<Record<string, unknown>>} */
  const actionDiffs = [];

  const legacyRoles = (legacy.sections ?? [])
    .map((s) => s.inferredSemanticRole)
    .filter(Boolean);
  const projectedVisible = (projected.sections ?? []).filter(
    (s) => s.visibility === 'visible' || s.visibility === 'footer_only',
  );
  const projectedRoles = projectedVisible.map((s) => s.semanticRole);

  const legacyRoleSet = new Set(legacyRoles);
  const projectedRoleSet = new Set(projectedRoles);

  let addedSections = 0;
  let removedSections = 0;
  let reorderedSections = 0;
  let CTAChanges = 0;
  let semanticCorrections = 0;

  for (const role of projectedRoleSet) {
    if (!legacyRoleSet.has(role)) {
      addedSections += 1;
      sectionDiffs.push({ code: 'SECTION_ADDED', sectionRole: role });
      criticalFindings.push({
        code: 'SECTION_ADDED',
        severity: 'correction',
        sectionRole: role,
        detail: `Projected adds ${role}`,
      });
      if (role === 'trust' || role === 'quote' || role === 'policies') semanticCorrections += 1;
    }
  }

  for (const role of legacyRoleSet) {
    if (!projectedRoleSet.has(role) && role !== 'services') {
      removedSections += 1;
      sectionDiffs.push({ code: 'SECTION_REMOVED', sectionRole: role });
    }
  }

  // Order comparison for shared roles
  const legacyOrder = legacyRoles.filter((r) => projectedRoleSet.has(r));
  const projectedOrder = projectedRoles.filter((r) => legacyRoleSet.has(r));
  if (legacyOrder.join('|') !== projectedOrder.join('|') && legacyOrder.length && projectedOrder.length) {
    reorderedSections += 1;
    sectionDiffs.push({ code: 'SECTION_REORDERED', detail: 'shared section order differs' });
    criticalFindings.push({
      code: 'SECTION_REORDERED',
      severity: 'info',
      detail: 'Shared sections reordered vs legacy',
    });
  }

  // CTA: Book → Request a quote
  const legacyCta = normalizeCta(
    legacy.primaryCtaLabel ?? legacy.sections?.[0]?.actions?.[0] ?? 'book',
  );
  const projectedCta = projected.primaryAction?.action ?? null;
  if (legacyCta !== projectedCta && projectedCta) {
    CTAChanges += 1;
    actionDiffs.push({
      code: 'CTA_CHANGED',
      legacyValue: legacyCta,
      projectedValue: projectedCta,
    });
    criticalFindings.push({
      code: 'CTA_CHANGED',
      severity: 'correction',
      legacyValue: legacyCta,
      projectedValue: projectedCta,
    });
    if (legacyCta === 'book' && projectedCta === 'request_quote') {
      semanticCorrections += 1;
      criticalFindings.push({
        code: 'BOOK_CHANGED_TO_REQUEST_QUOTE',
        severity: 'correction',
        detail: 'Advisory CTA replaces legacy Book',
      });
    }
  }

  // Item-role corrections from flat legacy services dump
  const flatServices = (legacy.sections ?? []).find((s) => s.inferredSemanticRole === 'services');
  const itemRoles = flatServices?.itemRoles ?? [];
  if (itemRoles.includes('testimonial') || itemRoles.some((r) => /testimonial/i.test(r))) {
    semanticCorrections += 1;
    criticalFindings.push({
      code: 'TESTIMONIAL_REMOVED_FROM_SERVICES',
      severity: 'correction',
      detail: 'Testimonials no longer projected as services',
    });
  }
  if (itemRoles.includes('policy') || itemRoles.some((r) => /policy|terms|guarantee/i.test(r))) {
    semanticCorrections += 1;
    criticalFindings.push({
      code: 'POLICY_REMOVED_FROM_CATALOG',
      severity: 'correction',
      detail: 'Policies moved out of service catalog',
    });
  }
  if (itemRoles.includes('career') || itemRoles.some((r) => /career|job/i.test(r))) {
    semanticCorrections += 1;
    criticalFindings.push({
      code: 'CAREER_REMOVED_FROM_CATALOG',
      severity: 'correction',
      detail: 'Career moved to footer',
    });
  }

  // SECTION_ROLE_CHANGED for mixed legacy roles
  const roleChangedCount = itemRoles.filter((r) =>
    ['testimonial', 'policy', 'career', 'trust_content', 'navigation'].includes(r),
  ).length;
  if (roleChangedCount > 0) {
    criticalFindings.push({
      code: 'SECTION_ROLE_CHANGED',
      severity: 'correction',
      detail: `${roleChangedCount} legacy catalog rows re-homed by semantic role`,
    });
    semanticCorrections += roleChangedCount > 0 ? 1 : 0;
  }

  // Fallbacks
  for (const section of projected.sections ?? []) {
    if (section.compatibilityFallback?.used) {
      criticalFindings.push({
        code: 'PROJECTED_RENDERER_FALLBACK',
        severity: 'warning',
        sectionRole: section.semanticRole,
        detail: section.compatibilityFallback.reason,
      });
    }
  }

  // Unsafe regressions
  /** @type {string[]} */
  const blockers = [];
  /** @type {string[]} */
  const warnings = [];

  const sourcedServices = catalogItems.filter(
    (p) =>
      p &&
      typeof p === 'object' &&
      p.contentRole === 'service' &&
      (p.contentOrigin === 'sourced' || !p.contentOrigin),
  );
  const projectedServiceRefs = new Set(
    (projected.sections ?? [])
      .filter((s) => s.semanticRole === 'services')
      .flatMap((s) => s.items.map((i) => i.id)),
  );
  for (const svc of sourcedServices) {
    const name = String(svc.name ?? svc.title ?? '');
    const found = [...projectedServiceRefs].some((ref) =>
      ref.toLowerCase().includes(name.toLowerCase().replace(/\s+/g, '-')),
    );
    // Soft check — only block when we had services section with zero items but sourced services exist
    void found;
  }
  const servicesSection = (projected.sections ?? []).find((s) => s.semanticRole === 'services');
  if (sourcedServices.length > 0 && servicesSection && servicesSection.items.length === 0) {
    blockers.push('SOURCED_SERVICE_MISSING');
    criticalFindings.push({
      code: 'SOURCED_SERVICE_MISSING',
      severity: 'blocker',
      detail: 'Sourced services missing from projected services section',
    });
  }

  if (projected.primaryAction && !projected.primaryAction.enabled && !projected.primaryAction.href) {
    // request_quote may use hash route — only block when call/book without evidence and no fallback
    if (['call', 'book', 'buy'].includes(projected.primaryAction.action)) {
      blockers.push('PRIMARY_CTA_NO_DESTINATION');
      criticalFindings.push({
        code: 'PRIMARY_CTA_NO_DESTINATION',
        severity: 'blocker',
        detail: `Primary ${projected.primaryAction.action} disabled without destination`,
      });
    } else {
      warnings.push('PRIMARY_CTA_SOFT_DISABLED');
    }
  }

  const visible = (projected.sections ?? []).filter((s) => s.visibility === 'visible');
  if (visible.length > 0 && visible.every((s) => (s.items?.length ?? 0) === 0) && !visible.some((s) => ['hero', 'quote', 'contact', 'booking'].includes(s.semanticRole))) {
    blockers.push('ALL_VISIBLE_SECTIONS_EMPTY');
    criticalFindings.push({
      code: 'ALL_VISIBLE_SECTIONS_EMPTY',
      severity: 'blocker',
    });
  }

  // Forbidden commerce meaning changes
  for (const section of projected.sections ?? []) {
    if (['services', 'products'].includes(section.semanticRole)) {
      for (const item of section.items ?? []) {
        if (['policy', 'career', 'testimonial'].includes(item.contentRole)) {
          blockers.push('FALLBACK_CHANGES_COMMERCE_MEANING');
          criticalFindings.push({
            code: 'FALLBACK_CHANGES_COMMERCE_MEANING',
            severity: 'blocker',
            detail: `${item.contentRole} in ${section.semanticRole}`,
          });
        }
      }
    }
  }

  const fallbackHeavy = (projected.compatibility?.fallbackCount ?? 0) > 3;
  if (fallbackHeavy) warnings.push('HIGH_COMPATIBILITY_FALLBACK_COUNT');

  const safeForPreview = blockers.length === 0;
  const safeForControlledCutover =
    safeForPreview &&
    (projected.compatibility?.fullySupported === true ||
      (projected.compatibility?.fallbackCount ?? 0) <= 2) &&
    !fallbackHeavy;

  if (!safeForControlledCutover && safeForPreview) {
    warnings.push('RENDERER_CAPABILITY_GAPS_BLOCK_CUTOVER');
  }

  const equivalent =
    addedSections === 0 &&
    removedSections === 0 &&
    reorderedSections === 0 &&
    CTAChanges === 0 &&
    semanticCorrections === 0;

  return freezeShadowComparison({
    version: SHADOW_COMPARISON_VERSION,
    summary: {
      equivalent,
      legacySectionCount: legacy.sections?.length ?? 0,
      projectedSectionCount: projectedVisible.length,
      addedSections,
      removedSections,
      reorderedSections,
      CTAChanges,
      semanticCorrections,
    },
    sectionDiffs,
    actionDiffs,
    criticalFindings,
    readiness: {
      safeForPreview,
      safeForControlledCutover,
      blockers,
      warnings,
    },
    authoritative: false,
  });
}

/** @param {string} value */
function normalizeCta(value) {
  const t = String(value ?? '').toLowerCase();
  if (t.includes('quote')) return 'request_quote';
  if (t.includes('book')) return 'book';
  if (t.includes('buy')) return 'buy';
  if (t.includes('order')) return 'order';
  if (t.includes('reserve')) return 'reserve';
  if (t.includes('call')) return 'call';
  return t.replace(/\s+/g, '_') || 'enquire';
}
