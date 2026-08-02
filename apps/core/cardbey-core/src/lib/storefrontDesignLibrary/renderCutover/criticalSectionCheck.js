/**
 * Decide whether projection package has an unsupported *critical* section
 * that must force legacy fallback (never change commercial meaning).
 */

/** Roles that must remain renderable for cutover eligibility. */
export const CRITICAL_SEMANTIC_ROLES = Object.freeze(['hero', 'services', 'products', 'menu', 'quote']);

/**
 * @param {object|null|undefined} viewModel
 * @returns {{ criticalUnsupported: boolean, detail: string|null }}
 */
export function assessCriticalSectionSupport(viewModel) {
  if (!viewModel || typeof viewModel !== 'object') {
    return { criticalUnsupported: true, detail: 'view_model_missing' };
  }
  const sections = Array.isArray(viewModel.sections) ? viewModel.sections : [];
  if (!sections.length) {
    return { criticalUnsupported: true, detail: 'projection_sections_empty' };
  }

  const visible = sections.filter((s) => s && s.visibility !== 'hidden');
  const hasHero = visible.some((s) => s.semanticRole === 'hero');
  if (!hasHero) {
    return { criticalUnsupported: true, detail: 'critical_hero_missing' };
  }

  // Offering or quote must exist for commerce-shaped businesses; portfolio may only have projects/gallery.
  const hasOfferingOrQuote = visible.some((s) =>
    ['services', 'service_categories', 'products', 'menu', 'quote', 'projects', 'gallery'].includes(
      s.semanticRole,
    ),
  );
  if (!hasOfferingOrQuote) {
    return { criticalUnsupported: true, detail: 'critical_offering_or_quote_missing' };
  }

  // Forbidden commercial pollution already thrown in adapter; soft-check here.
  for (const section of visible) {
    if (!['services', 'products', 'menu', 'featured_items'].includes(section.semanticRole)) continue;
    const items = Array.isArray(section.items) ? section.items : [];
    const bad = items.find((i) =>
      ['policy', 'career', 'testimonial', 'trust_content', 'navigation'].includes(i?.contentRole),
    );
    if (bad) {
      return {
        criticalUnsupported: true,
        detail: `forbidden_commerce_mapping:${bad.contentRole}`,
      };
    }
  }

  // request_quote must never appear as book
  if (viewModel.primaryAction?.action === 'book' && viewModel.businessModel === 'service_quote') {
    return { criticalUnsupported: true, detail: 'quote_business_mapped_to_book' };
  }

  return { criticalUnsupported: false, detail: null };
}
