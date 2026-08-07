/**
 * Validate the actual preview-shaped object about to be published (Phase 8B).
 */

import { isStorefrontAction } from '../contracts/storefrontAction.js';

/**
 * @param {object} preview
 * @param {{ catalogProducts?: unknown[] }} [opts]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePublishSnapshot(preview, opts = {}) {
  /** @type {string[]} */
  const errors = [];
  if (!preview || typeof preview !== 'object') {
    return { ok: false, errors: ['snapshot_missing'] };
  }

  const website = preview.website;
  if (!website || typeof website !== 'object') {
    errors.push('website_missing');
  }

  const sections = Array.isArray(website?.sections) ? website.sections : [];
  if (!sections.length) {
    errors.push('sections_empty');
  }

  const ids = new Set();
  const productIds = new Set(
    (Array.isArray(opts.catalogProducts) ? opts.catalogProducts : preview.items || [])
      .map((p) => (p && typeof p === 'object' ? String(p.id ?? p.productId ?? '').trim() : ''))
      .filter(Boolean),
  );

  for (const section of sections) {
    if (!section || typeof section !== 'object') {
      errors.push('section_invalid');
      continue;
    }
    const id = String(section.id ?? '').trim();
    if (!id) {
      errors.push('section_missing_id');
    } else if (ids.has(id)) {
      errors.push(`duplicate_section_id:${id}`);
    } else {
      ids.add(id);
    }

    const visibility = String(section.visibility ?? 'visible');
    if (visibility === 'footer_only') {
      const placement = String(section.placement ?? section.region ?? '');
      if (placement && placement !== 'footer' && placement !== 'footer_only') {
        errors.push(`footer_only_misplaced:${id || 'unknown'}`);
      }
    }

    const actions = Array.isArray(section.actions)
      ? section.actions
      : section.cta
        ? [section.cta]
        : [];
    for (const action of actions) {
      const token =
        typeof action === 'string'
          ? action
          : action && typeof action === 'object'
            ? action.action
            : null;
      if (token && !isStorefrontAction(token)) {
        errors.push(`invalid_cta:${token}`);
      }
    }

    const items = Array.isArray(section.items) ? section.items : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const itemId = String(item.id ?? item.productId ?? item.ref ?? '').trim();
      if (itemId && productIds.size > 0 && !productIds.has(itemId) && item.refType === 'catalog') {
        errors.push(`orphaned_item_ref:${itemId}`);
      }
    }
  }

  const primary =
    preview.primaryCTA ||
    preview.meta?.primaryCTA ||
    website?.primaryCTA ||
    website?.primaryAction;
  if (primary && typeof primary === 'object' && primary.action && !isStorefrontAction(primary.action)) {
    errors.push(`primary_cta_invalid:${primary.action}`);
  } else if (typeof primary === 'string') {
    const normalized = primary.trim().toLowerCase().replace(/\s+/g, '_');
    // Legacy labels like "Book" / "Shop" are allowed on legacy path; only fail known-invalid tokens
    if (normalized.includes(':') || normalized.includes('/')) {
      errors.push(`primary_cta_invalid:${primary}`);
    }
  }

  // Hero: require presence only when legacy-shaped preview claimed a hero media type
  const heroRequired = Boolean(
    preview.heroMediaType ||
      preview.heroImageUrl ||
      preview.heroVideoUrl ||
      (preview.hero && typeof preview.hero === 'object'),
  );
  if (heroRequired) {
    const hasHero = Boolean(
      preview.heroImageUrl ||
        preview.heroVideoUrl ||
        (preview.hero && (preview.hero.imageUrl || preview.hero.videoUrl || preview.hero.url)),
    );
    if (!hasHero) errors.push('hero_missing');
  }

  return { ok: errors.length === 0, errors };
}
