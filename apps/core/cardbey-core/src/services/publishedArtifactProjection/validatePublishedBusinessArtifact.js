const GENERIC_CARD_FALLBACK = 'browse our menu and order online';

/**
 * @param {object} projection
 * @returns {{ valid: boolean, warnings: Array<{ code: string, message: string }> }}
 */
export function validatePublishedBusinessArtifact(projection) {
  const warnings = [...(projection?.diagnostics?.warnings ?? [])];

  if (!projection?.slug) {
    warnings.push({ code: 'missing_slug', message: 'slug is required' });
  }
  if (!projection?.name) {
    warnings.push({ code: 'missing_name', message: 'name is required' });
  }
  if (!projection?.tenantId) {
    warnings.push({ code: 'missing_tenant', message: 'tenantId is required' });
  }
  if (projection?.storeId && !projection?.businessId) {
    warnings.push({ code: 'missing_business_id', message: 'businessId required when store-scoped' });
  }

  const hero = projection?.hero ?? {};
  if ((hero.type === 'video' || hero.type === 'image') && !hero.videoUrl && !hero.imageUrl) {
    warnings.push({ code: 'hero_media_missing', message: 'Hero type requires imageUrl or videoUrl' });
  }

  const desc = (projection?.content?.description ?? '').toLowerCase().trim();
  const tagline = projection?.content?.tagline ?? null;
  if (!tagline && projection?.channels?.homepageCard?.enabled) {
    warnings.push({ code: 'homepage_tagline_empty', message: 'Homepage card has no tagline' });
  }
  if (!projection?.website?.sections?.length && projection?.channels?.publicWebsite?.enabled) {
    warnings.push({ code: 'public_website_no_sections', message: 'Public website enabled but no sections' });
  }
  if (desc === GENERIC_CARD_FALLBACK) {
    warnings.push({
      code: 'generic_fallback_description',
      message: 'Projection uses generic fallback description',
    });
  }

  const hasGenerated =
    !!tagline ||
    (desc && desc !== GENERIC_CARD_FALLBACK) ||
    !!hero.videoUrl ||
    !!hero.imageUrl;
  if (hasGenerated && desc === GENERIC_CARD_FALLBACK) {
    warnings.push({
      code: 'generic_despite_content',
      message: 'Generic fallback description despite generated content',
    });
  }

  const valid = !warnings.some((w) =>
    ['missing_slug', 'missing_name', 'missing_tenant', 'missing_business_id'].includes(w.code),
  );

  return { valid, warnings };
}
