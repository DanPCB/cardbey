/**
 * Whole-store coherence checks after generation (advisory + auto-repair hooks).
 * Prefer SPECIFIC + TRUTHFUL + INCOMPLETE over GENERIC + INVENTED + COMPLETE.
 */

import {
  countServiceCatalogPlaceholderHits,
  isProfessionalServiceVertical,
  isServiceCatalogPlaceholderName,
} from '../../lib/catalog/serviceCatalogPlaceholders.js';
import { PROFESSIONAL_RE } from '../../lib/catalog/classifyBusinessType.js';

/**
 * @param {object} preview
 * @param {object} [ctx] storeGenerationBusinessContext
 */
export function validateStoreCoherence(preview, ctx = null) {
  const warnings = [];
  const critical = [];
  const items = Array.isArray(preview?.items) ? preview.items : [];
  const storeName = String(preview?.storeName ?? ctx?.businessName ?? '');
  const storeType = String(preview?.storeType ?? ctx?.primaryCategory ?? '');
  const blob = `${storeName} ${storeType} ${ctx?.verticalSlug || ''} ${ctx?.industry || ''}`;
  const professional =
    (ctx && isProfessionalServiceVertical(ctx)) || PROFESSIONAL_RE.test(blob);

  const placeholderHits = countServiceCatalogPlaceholderHits(items);
  if (placeholderHits > 0) {
    const msg = `${placeholderHits} generic scaffold offering(s) (e.g. Core Service / Express Service)`;
    if (professional) critical.push(msg);
    else warnings.push(msg);
  }

  const cta =
    preview?.website?.sections?.find((s) => s?.type === 'hero')?.content?.ctaLabel ||
    preview?.primaryCTA ||
    ctx?.primaryCTA ||
    '';
  if (professional && /add to cart/i.test(String(cta))) {
    critical.push('Professional/finance store uses Add to cart CTA');
  }

  const showSection = (preview?.website?.sections || []).find((s) => s?.type === 'show');
  if (professional && showSection) {
    warnings.push('Shows section present for professional business without entertainment context');
  }

  const fakeReviewAuthors = new Set(['alex m.', 'jordan k.', 'sam r.']);
  const social = (preview?.website?.sections || []).find((s) => s?.type === 'social_proof');
  const reviews = social?.content?.reviews;
  if (
    professional &&
    Array.isArray(reviews) &&
    reviews.some((r) => fakeReviewAuthors.has(String(r?.author ?? '').toLowerCase()))
  ) {
    critical.push('Invented social-proof reviews on professional storefront');
  }

  const missingImages = items.filter((it) => !String(it?.imageUrl ?? '').trim()).length;
  if (missingImages > 0 && items.length > 0 && missingImages / items.length >= 0.5) {
    warnings.push('Majority of catalog items lack images (risk of letter placeholders in UI)');
  }

  const scaffoldNames = items
    .filter((it) => isServiceCatalogPlaceholderName(it?.name))
    .map((it) => it.name);

  return {
    ok: critical.length === 0,
    critical,
    warnings,
    scaffoldNames,
    professional,
    summary:
      critical.length === 0
        ? warnings.length
          ? `ok_with_warnings:${warnings.length}`
          : 'ok'
        : `critical:${critical.length}`,
  };
}
