/**
 * Builds mini-website section payloads for draft preview (WebsitePreviewPage).
 * Shapes must match dashboard `WebsiteSection` types: hero, usp_bar, show, about, social_proof, contact.
 */

import { resolveTransactionCommerce } from '../../lib/storeTransactionMode.js';
import { getIndustryWebsiteCopy } from './industryBlueprintRegistry.js';
import Mission001Flags from '../../lib/mission001/mission001Flags.js';
import {
  applyPipelineGeneratedHeroImage,
  getExistingVideoUrlFromPreview,
} from './draftPreviewHeroSync.js';
import {
  applyFoundationToSectionsAndPreview,
  themePatchFromFoundation,
} from './websiteTemplateFoundation.js';

/**
 * @param {string} storeType
 * @returns {'minimal'|'bold'|'editorial'|'warm'|'dark'}
 */
function templateIdForStoreType(storeType) {
  const t = (storeType || '').toString().toLowerCase().replace(/\s+/g, '_');
  if (/\b(florist|flower|garden)\b/.test(t) || t.includes('florist')) return 'editorial';
  if (/\b(salon|spa|nail|beauty|barber)\b/.test(t)) return 'minimal';
  if (/\b(retail|fashion|clothing|apparel|boutique)\b/.test(t)) return 'minimal';
  if (/\b(cafe|coffee|restaurant|bakery|bar|food)\b/.test(t)) return 'warm';
  return 'warm';
}

/** @param {{ id?: string, productId?: string } | null | undefined, index: number }} */
function stableItemKey(item, index) {
  if (!item || typeof item !== 'object') return `idx_${index}`;
  const id = item.id != null && String(item.id).trim() ? String(item.id).trim() : null;
  if (id) return id;
  const pid = item.productId != null && String(item.productId).trim() ? String(item.productId).trim() : null;
  if (pid) return pid;
  return `idx_${index}`;
}

/**
 * @param {object} preview - draft preview object (mutated: heroImageUrl, avatarUrl, website)
 * @param {object} [input] - draft.input
 *   When `input.websiteTemplateFoundation` is set (from ensureWebsiteTemplateFoundationOnInput),
 *   theme tokens + section order come from the selected STORE_WEBSITE template.
 *   Adaptive path: no foundation → same heuristic layout as pre–Phase 2.
 */
export function mergeWebsiteIntoPreview(preview, input = {}) {
  if (!preview || typeof preview !== 'object') return;

  const heroUrl = preview.heroImageUrl ?? preview.hero?.imageUrl ?? preview.hero?.url ?? null;
  if (heroUrl && !preview.heroImageUrl && !getExistingVideoUrlFromPreview(preview)) {
    applyPipelineGeneratedHeroImage(preview, heroUrl, { writer: 'mergeWebsiteIntoPreview' });
  }

  const avUrl = preview.avatarUrl ?? preview.avatar?.imageUrl ?? preview.avatar?.url ?? null;
  if (avUrl && !preview.avatarUrl) preview.avatarUrl = avUrl;

  const storeName = preview.storeName || 'Your store';
  const storeType = preview.storeType || 'Store';
  const commerce = resolveTransactionCommerce(storeType);
  const slogan = preview.slogan || preview.tagline || preview.heroText || '';
  const location = (input.location && String(input.location).trim()) || '';
  const blurb =
    (input.businessDescription && String(input.businessDescription).trim()) ||
    (input.prompt && String(input.prompt).trim()) ||
    (input.rawInput && String(input.rawInput).trim()) ||
    '';

  const items = Array.isArray(preview.items) ? preview.items : [];
  const featuredIds = items.slice(0, 4).map((it, i) => stableItemKey(it, i));

  const aboutBody =
    blurb ||
    `${storeName} is a ${storeType} dedicated to quality and a great customer experience.` +
      (location ? ` Visit us in ${location}.` : '');

  const firstItemImage = items.find((it) => it?.imageUrl)?.imageUrl ?? null;

  const verticalSlug = preview.meta?.verticalSlug ?? input?.verticalSlug ?? null;
  const verticalGroup = preview.meta?.verticalGroup ?? input?.verticalGroup ?? null;
  const industryCopy = getIndustryWebsiteCopy({
    businessName: storeName,
    storeName,
    businessType: storeType,
    storeType,
    verticalSlug,
    verticalGroup,
  });
  const professionalContext = /\b(capital|finance|financial|investment|wealth|accounting|legal|lawyer|consulting|advisory|professional)\b/i.test(
    `${storeName} ${storeType} ${verticalSlug || ''} ${verticalGroup || ''}`,
  );
  const entertainmentShows =
    /\b(show|shows|entertainment|game|arcade|cinema|theatre|theater|venue|performance)\b/i.test(
      `${storeType} ${verticalSlug || ''}`,
    );
  const uspItems =
    industryCopy?.uspItems ??
    [
      {
        icon: '✦',
        label: commerce.transactionMode === 'booking' || professionalContext ? 'Expert advice' : 'Curated quality',
        description:
          commerce.transactionMode === 'booking' || professionalContext
            ? 'Professional services tailored to you.'
            : 'Hand-picked products you will love.',
      },
      {
        icon: '⚡',
        label: professionalContext ? 'Clear next steps' : 'Fast service',
        description:
          professionalContext
            ? 'Book a consultation when you are ready.'
            : commerce.transactionMode === 'booking'
              ? 'Easy booking from browse to appointment.'
              : 'A smooth experience from browse to checkout.',
      },
      {
        icon: '♥',
        label: professionalContext ? 'Client focused' : 'Made for you',
        description: professionalContext
          ? 'Practical guidance with transparent expectations.'
          : `${storeType} essentials with personality.`,
      },
    ];
  const heroCtaLabel =
    industryCopy?.ctaLabel ??
    (professionalContext ? 'Book consultation' : commerce.ctaLabel);

  /** @type {Array<{ type: string, content: Record<string, unknown> }>} */
  const sections = [
    {
      type: 'hero',
      content: {
        headline: storeName,
        subheadline: slogan || `Welcome to ${storeName}`,
        ctaLabel: heroCtaLabel,
        ctaSecondary: 'Our story',
      },
    },
    {
      type: 'usp_bar',
      content: {
        items: uspItems,
      },
    },
  ];

  // Shows only when the business model supports intentional rich media — not a catalog dump.
  if (entertainmentShows && featuredIds.length > 0) {
    sections.push({
      type: 'show',
      content: {
        heading: 'Shows',
        productIds: featuredIds,
      },
    });
  }

  // Fabricated reviews are not truthful business content — omit when Mission 001 sparse mode is active.
  const allowFabricatedReviews =
    !Mission001Flags.sparseMode &&
    !input?.mission001SparseMode &&
    !preview?.meta?.mission001?.sparseMode &&
    !(Array.isArray(input?.verifiedReviews) && input.verifiedReviews.length);
  if (!professionalContext && allowFabricatedReviews) {
    sections.push({
      type: 'social_proof',
      content: {
        heading: 'What customers say',
        reviews: [
          { text: `Absolutely love ${storeName} — great selection and friendly vibe.`, author: 'Alex M.', rating: 5 },
          { text: 'Quality exceeded expectations. Will definitely come back!', author: 'Jordan K.', rating: 5 },
          { text: 'Easy to shop and beautiful presentation. Highly recommend.', author: 'Sam R.', rating: 4 },
        ],
      },
    });
  }

  sections.push(
    {
      type: 'about',
      content: {
        heading: 'Our story',
        body: aboutBody,
        imageUrl: firstItemImage || heroUrl || null,
      },
    },
    {
      type: 'contact',
      content: {
        heading: professionalContext ? 'Contact us' : 'Visit us',
        address: location || null,
        hours: professionalContext ? 'By appointment' : 'Open daily — hours on request',
        cta: professionalContext ? 'Book consultation' : 'Get directions',
      },
    },
  );

  const foundation =
    input?.websiteTemplateFoundation && typeof input.websiteTemplateFoundation === 'object'
      ? input.websiteTemplateFoundation
      : null;
  const orderedSections = applyFoundationToSectionsAndPreview(preview, sections, foundation);

  const fallbackTemplateId = templateIdForStoreType(storeType);
  const themePatch = themePatchFromFoundation(foundation, fallbackTemplateId);
  preview.website = {
    ...(preview.website && typeof preview.website === 'object' ? preview.website : {}),
    sections: orderedSections,
    theme: {
      ...(preview.website?.theme && typeof preview.website.theme === 'object' ? preview.website.theme : {}),
      ...themePatch,
    },
    generatedAt: new Date().toISOString(),
  };
}
