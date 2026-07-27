/**
 * Build draft preview for ghost stores — extraction-only, no fabricated reviews or hours.
 */

import { resolveTransactionCommerce } from '../storeTransactionMode.js';
import { applyPipelineGeneratedHeroImage } from '../../services/draftStore/draftPreviewHeroSync.js';

/**
 * @param {object} params
 * @param {object} params.extraction
 * @param {{ lat?: number; lng?: number } | null} [params.location]
 * @param {string | null} [params.heroImageUrl]
 */
export function buildGhostStorePreview({ extraction, location, heroImageUrl }) {
  const storeName =
    (typeof extraction?.businessName === 'string' && extraction.businessName.trim()) || 'Unnamed store';
  const storeType =
    (typeof extraction?.category === 'string' && extraction.category.trim()) || 'general';
  const tagline =
    (typeof extraction?.tagline === 'string' && extraction.tagline.trim()) || '';
  const address =
    (typeof extraction?.visibleAddress === 'string' && extraction.visibleAddress.trim()) ||
    (location?.lat != null && location?.lng != null ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : '');

  const commerce = resolveTransactionCommerce(storeType);
  const brandColors = Array.isArray(extraction?.brandColors)
    ? extraction.brandColors.filter(Boolean)
    : [];
  const primaryColor = brandColors[0] && /^#?[0-9a-f]{3,8}$/i.test(brandColors[0])
    ? (brandColors[0].startsWith('#') ? brandColors[0] : `#${brandColors[0]}`)
    : '#6C4CF1';

  /** @type {object} */
  const preview = {
    storeName,
    storeType,
    slogan: tagline,
    tagline,
    heroText: tagline,
    heroImageUrl: heroImageUrl ?? null,
    brandColors: { primary: primaryColor, secondary: brandColors[1] ?? '#1e293b' },
    items: [],
    categories: [{ id: 'default', name: 'Featured' }],
  };

  if (heroImageUrl) {
    applyPipelineGeneratedHeroImage(preview, heroImageUrl, { writer: 'ghostStorePreviewBuilder' });
  }

  const aboutBody = tagline
    ? `${storeName}. ${tagline}`
    : `${storeName} — spotted by the Cardbey community. Details are being verified.`;

  preview.website = {
    sections: [
      {
        type: 'hero',
        content: {
          headline: storeName,
          subheadline: tagline || `Welcome to ${storeName}`,
          ctaLabel: commerce.ctaLabel,
        },
      },
      {
        type: 'about',
        content: {
          heading: 'About',
          body: aboutBody,
          imageUrl: heroImageUrl ?? null,
        },
      },
      {
        type: 'contact',
        content: {
          heading: 'Visit',
          address: address || null,
          phone: extraction?.visiblePhone?.trim() || null,
        },
      },
    ],
    theme: { templateId: 'warm' },
    generatedAt: new Date().toISOString(),
  };

  return preview;
}
