/**
 * Builds mini-website section payloads for draft preview (WebsitePreviewPage).
 * Shapes must match dashboard `WebsiteSection` types: hero, usp_bar, show, about, social_proof, contact.
 */

import { resolveTransactionCommerce } from '../../lib/storeTransactionMode.js';
import { getIndustryWebsiteCopy } from './industryBlueprintRegistry.js';
import {
  applyPipelineGeneratedHeroImage,
  getExistingVideoUrlFromPreview,
} from './draftPreviewHeroSync.js';
import {
  applyFoundationToSectionsAndPreview,
  themePatchFromFoundation,
} from './websiteTemplateFoundation.js';
import { toDisplayReadyCopy } from '../../lib/storeGeneration/businessUnderstanding.js';
import { displayBusinessTypeForCopy } from './storeCreationAuthorityTrace.js';

function sanitizeDisplay(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  try {
    return toDisplayReadyCopy(s) || s;
  } catch {
    return s;
  }
}
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
 * Business-aware website sections when ENABLE_GROUNDED_STORE_CREATION_V1 composition is present.
 * @param {object} preview
 * @param {object} input
 * @param {object} composition
 */
function mergeGroundedWebsiteIntoPreview(preview, input, composition) {
  const heroUrl = preview.heroImageUrl ?? preview.hero?.imageUrl ?? preview.hero?.url ?? null;
  if (heroUrl && !preview.heroImageUrl && !getExistingVideoUrlFromPreview(preview)) {
    applyPipelineGeneratedHeroImage(preview, heroUrl, { writer: 'mergeWebsiteIntoPreview' });
  }
  const avUrl = preview.avatarUrl ?? preview.avatar?.imageUrl ?? preview.avatar?.url ?? null;
  if (avUrl && !preview.avatarUrl) preview.avatarUrl = avUrl;

  const storeName = preview.storeName || 'Your store';
  const storeTypeRaw = preview.storeType || composition.archetype || 'Store';
  const storeType = displayBusinessTypeForCopy(storeTypeRaw, composition.archetype);
  const slogan = sanitizeDisplay(preview.slogan || preview.tagline || preview.heroText || '');
  const location = (input.location && String(input.location).trim()) || '';
  const blurb =
    sanitizeDisplay(input.businessDescription) ||
    sanitizeDisplay(input.prompt) ||
    '';
  const items = Array.isArray(preview.items) ? preview.items : [];
  const featuredIds = items.slice(0, 6).map((it, i) => stableItemKey(it, i));
  const firstItemImage = items.find((it) => it?.imageUrl)?.imageUrl ?? null;
  const themeSpec = composition.themeSpec || {};
  const primaryCta = composition.primaryCTA || preview.primaryCTA || 'Learn More';
  const secondaryCta = composition.secondaryCTA || 'Contact';
  const offeringHeading =
    composition.offeringPresentation === 'menu'
      ? 'Menu'
      : composition.offeringPresentation === 'product_grid'
        ? 'Products'
        : 'Services';
  const aboutBody =
    blurb ||
    (composition.offeringPresentation === 'menu'
      ? `${storeName} serves fresh favourites. ${location ? `Find us in ${location}.` : ''}`.trim()
      : composition.archetype === 'FINANCIAL_SERVICE' || composition.archetype === 'PROFESSIONAL_SERVICE'
        ? `${storeName} helps you understand your options and take the next step with confidence.`
        : `${storeName} — ${storeType}.`);

  /** @type {Array<{ type: string, content: Record<string, unknown> }>} */
  const sections = [];
  const types = Array.isArray(composition.websiteSectionTypes)
    ? composition.websiteSectionTypes
    : ['hero', 'show', 'about', 'contact'];

  for (const type of types) {
    if (type === 'hero') {
      sections.push({
        type: 'hero',
        content: {
          headline: storeName,
          subheadline: slogan || aboutBody.slice(0, 120),
          ctaLabel: primaryCta,
          ctaSecondary: secondaryCta,
        },
      });
    } else if (type === 'show') {
      sections.push({
        type: 'show',
        content: {
          heading: offeringHeading,
          productIds: featuredIds,
        },
      });
    } else if (type === 'about') {
      sections.push({
        type: 'about',
        content: {
          heading:
            composition.archetype === 'FINANCIAL_SERVICE' || composition.archetype === 'PROFESSIONAL_SERVICE'
              ? 'How we help'
              : 'Our story',
          body: aboutBody,
          imageUrl: firstItemImage || heroUrl || null,
        },
      });
    } else if (type === 'contact') {
      sections.push({
        type: 'contact',
        content: {
          heading:
            composition.archetype === 'FINANCIAL_SERVICE'
              ? 'Book a consultation'
              : composition.offeringPresentation === 'menu'
                ? 'Visit & hours'
                : 'Contact',
          address: location || null,
          hours: input.hours || input.openingHours || null,
          cta: secondaryCta || primaryCta,
        },
      });
    } else if (type === 'trust_block' && !composition.skipFabricatedReviews) {
      sections.push({
        type: 'social_proof',
        content: {
          heading: 'What customers say',
          reviews: [],
        },
      });
    } else if (type === 'gallery') {
      // Renderer may ignore unknown types; keep as about image emphasis via show if needed
      continue;
    } else if (type === 'usp_bar' && !composition.skipGenericUsp) {
      sections.push({
        type: 'usp_bar',
        content: { items: [] },
      });
    }
  }

  if (!sections.some((s) => s.type === 'hero')) {
    sections.unshift({
      type: 'hero',
      content: {
        headline: storeName,
        subheadline: slogan || '',
        ctaLabel: primaryCta,
        ctaSecondary: secondaryCta,
      },
    });
  }

  preview.primaryCTA = primaryCta;
  preview.meta = {
    ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
    businessArchetype: composition.archetype,
    groundedStoreCreation: true,
    groundedComposition: {
      archetype: composition.archetype,
      primaryCTA: primaryCta,
      offeringPresentation: composition.offeringPresentation,
      gate: composition.gate || null,
    },
  };

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
      ...(themeSpec.primary ? { primary: themeSpec.primary, primaryColor: themeSpec.primary } : {}),
      ...(themeSpec.secondary ? { secondary: themeSpec.secondary, secondaryColor: themeSpec.secondary } : {}),
      ...(themeSpec.accent ? { accent: themeSpec.accent } : {}),
      ...(themeSpec.background ? { background: themeSpec.background } : {}),
      ...(themeSpec.typographyDirection ? { typographyDirection: themeSpec.typographyDirection } : {}),
      groundedTheme: true,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {object} preview - draft preview object (mutated: heroImageUrl, avatarUrl, website)
 * @param {object} [input] - draft.input
 *   When `input.websiteTemplateFoundation` is set (from ensureWebsiteTemplateFoundationOnInput),
 *   theme tokens + section order come from the selected STORE_WEBSITE template.
 *   Adaptive path: no foundation → same heuristic layout as pre–Phase 2.
 *   Grounded path: `input.groundedComposition` from ENABLE_GROUNDED_STORE_CREATION_V1.
 */
export function mergeWebsiteIntoPreview(preview, input = {}) {
  if (!preview || typeof preview !== 'object') return;

  const composition =
    (input.groundedComposition && typeof input.groundedComposition === 'object'
      ? input.groundedComposition
      : null) ||
    (preview.meta?.groundedComposition && typeof preview.meta.groundedComposition === 'object'
      ? preview.meta.groundedComposition
      : null);

  if (composition && composition.archetype) {
    mergeGroundedWebsiteIntoPreview(preview, input, composition);
    return;
  }

  const heroUrl = preview.heroImageUrl ?? preview.hero?.imageUrl ?? preview.hero?.url ?? null;
  if (heroUrl && !preview.heroImageUrl && !getExistingVideoUrlFromPreview(preview)) {
    applyPipelineGeneratedHeroImage(preview, heroUrl, { writer: 'mergeWebsiteIntoPreview' });
  }

  const avUrl = preview.avatarUrl ?? preview.avatar?.imageUrl ?? preview.avatar?.url ?? null;
  if (avUrl && !preview.avatarUrl) preview.avatarUrl = avUrl;

  const storeName = preview.storeName || 'Your store';
  const storeType = displayBusinessTypeForCopy(
    preview.storeType || 'Store',
    input.groundedComposition?.archetype || preview.meta?.groundedComposition?.archetype,
  );
  const commerce = resolveTransactionCommerce(preview.storeType || storeType);
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

  // Fake invented reviews are not truthful business content — omit for professional verticals.
  if (!professionalContext) {
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
