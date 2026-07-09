/**
 * Catalog build: single branching point for template / ai / ocr.
 * All builders return CatalogBuildResult. No image/hero/avatar logic here.
 *
 * CatalogBuildResult: { profile, categories, products, meta: { catalogSource, vertical? } }
 */

import { generateVerticalLockedMenu } from './menuGenerationService.js';
import { getMenuCategoriesAndAssignments } from './menuCategories.js';
import { performMenuOcr } from '../../modules/menu/performMenuOcr.js';
import { getTemplateItems, expandTemplateItems } from './templateItemsData.js';
import { resolveVerticalSlug } from './verticalResolver.js';
import { resolveVertical, resolveAudience } from '../../lib/verticals/verticalTaxonomy.js';
import { selectTemplateId } from './selectTemplateId.js';
import { buildOptionsSchema } from '../store/options/verticalOptionsSchema.js';
import { validateAndCorrect } from '../store/validators/verticalValidator.js';
import { validateAndCorrect as validateAndCorrectCatalog } from '../store/validators/catalogValidator.js';
import { buildSeedCatalog } from '../store/seeds/seedCatalogBuilder.js';
import { loadBusinessProfileService } from './loadBusinessProfileService.js';
import { inferCurrencyFromLocationText } from './currencyInfer.js';
import {
  CATALOG_ITEM_LIMIT,
  CATALOG_ITEM_MIN,
} from '../../config/catalogLimits.js';
import {
  dedupeCatalogProductsByName,
  normalizeCatalogProductName,
} from '../../lib/persistence/catalogDedupe.js';
import {
  applyCatalogProfileToItems,
  buildCatalogGenerationProfile,
  buildCategoriesFromProfile,
} from '../../lib/catalog/buildCatalogGenerationProfile.js';
import { repairServiceCatalogPlaceholderProducts } from '../../lib/catalog/serviceCatalogPlaceholders.js';
import { buildCuisineMenuCatalog, cuisineSlugToTemplateKey } from './foodCuisineCatalog.js';

function tsModuleUnavailable(name) {
  const e = new Error(`${name} unavailable in plain Node runtime. Run server with tsx or add build step to compile TS.`);
  e.status = 501;
  e.code = 'TS_MODULE_UNAVAILABLE';
  return e;
}

/** Forbidden in kids audience: adult-focused terms. Rebuild with fashion_kids if triggered. */
const KIDS_FORBIDDEN_ADULT = /\b(men's|mens|women's|womens|heels|lingerie|workwear|formal suit|dress shirt|leather boots|adult)\b/i;

/** Same-vertical variation names for AI catalog expansion (items < min → expand to limit). Do not use other verticals. */
const AI_EXPANSION_VARIATIONS = {
  'fashion.kids': [
    { name: 'Kids Long Sleeve Tee', description: 'Comfortable cotton long sleeve' },
    { name: 'Toddler Hoodie', description: 'Soft hoodie for little ones' },
    { name: 'Kids Shorts', description: 'Lightweight play shorts' },
    { name: 'Kids Leggings', description: 'Stretch leggings for active play' },
    { name: 'Kids Jacket', description: 'Light jacket for cool days' },
    { name: 'Kids Sneakers', description: 'Comfortable everyday sneakers' },
    { name: 'Kids Socks', description: 'Soft crew socks' },
    { name: 'Kids Hat', description: 'Sun hat or beanie' },
    { name: 'Kids Backpack', description: 'Small backpack for school' },
    { name: 'Kids Raincoat', description: 'Water-resistant raincoat' },
    { name: 'Kids Pajama Set', description: 'Cozy sleepwear' },
    { name: 'Toddler Dress', description: 'Casual everyday dress' },
  ],
  'food.seafood': [
    { name: 'Clam Chowder', description: 'Creamy New England style' },
    { name: 'Grilled Salmon', description: 'With lemon and herbs' },
    { name: 'Fish Tacos', description: 'Fresh fish with slaw' },
    { name: 'Shrimp Scampi', description: 'Garlic butter shrimp' },
    { name: 'Crab Cakes', description: 'Golden pan-seared' },
    { name: 'Lobster Roll', description: 'Buttered roll with lobster' },
    { name: 'Oysters', description: 'Half dozen fresh' },
    { name: 'Seafood Paella', description: 'Rice with shellfish' },
    { name: 'Calamari', description: 'Crispy fried squid' },
    { name: 'Fish and Chips', description: 'Beer-battered cod' },
    { name: 'Tuna Poke', description: 'Fresh tuna bowl' },
    { name: 'Seafood Chowder', description: 'Mixed seafood soup' },
  ],
  fashion: [
    { name: 'Long Sleeve Top', description: 'Everyday long sleeve' },
    { name: 'Hoodie', description: 'Casual hoodie' },
    { name: 'Shorts', description: 'Casual shorts' },
    { name: 'Leggings', description: 'Comfortable leggings' },
    { name: 'Jacket', description: 'Light layer' },
    { name: 'Sneakers', description: 'Casual sneakers' },
    { name: 'Socks', description: 'Crew socks' },
    { name: 'Cap', description: 'Baseball cap' },
    { name: 'Backpack', description: 'Everyday backpack' },
    { name: 'Raincoat', description: 'Water-resistant coat' },
  ],
  food: [
    { name: 'House Special', description: 'Chef recommendation' },
    { name: 'Seasonal Soup', description: 'Soup of the day' },
    { name: 'Side Salad', description: 'Fresh greens' },
    { name: 'Dessert Special', description: 'Daily dessert' },
    { name: 'Beverage', description: 'House beverage' },
    { name: 'Kids Option', description: 'Smaller portion' },
    { name: 'Vegetarian Option', description: 'Plant-based choice' },
    { name: 'Gluten-Free Option', description: 'GF available' },
    { name: 'Add-On', description: 'Extra side or topping' },
    { name: 'Combo Meal', description: 'Value combo' },
  ],
  signage: [
    { name: 'Rush Order Service', description: 'Fast turnaround for urgent sign needs' },
    { name: 'Site Survey', description: 'On-site measurement and consultation' },
    { name: 'Sign Removal', description: 'Safe removal of existing signage' },
    { name: 'Permit Assistance', description: 'Help with council sign permits' },
    { name: 'Illuminated Sign Upgrade', description: 'Convert existing signs to LED' },
    { name: 'Wayfinding Package', description: 'Complete directional sign system' },
  ],
  beauty: [
    { name: 'Blow Dry', description: 'Professional blow dry and style' },
    { name: 'Scalp Treatment', description: 'Nourishing scalp care treatment' },
    { name: 'Eyebrow Tinting', description: 'Tint and shape your brows' },
    { name: 'Lash Lift', description: 'Lift and curl your natural lashes' },
    { name: 'Dermal Filler Consultation', description: 'Free consultation for dermal treatments' },
    { name: 'Gift Voucher', description: 'Perfect gift for any occasion' },
  ],
  automotive: [
    { name: 'Vacuum & Wipe Down', description: 'Interior vacuum and surface clean' },
    { name: 'Tyre Shine', description: 'Professional tyre dressing' },
    { name: 'Air Freshener', description: 'Long-lasting interior fragrance' },
    { name: 'Engine Bay Clean', description: 'Professional engine bay degreasing' },
    { name: 'Headlight Restoration', description: 'Restore cloudy headlights to clarity' },
    { name: 'Scratch Touch-Up', description: 'Minor scratch repair and polish' },
  ],
  furniture: [
    { name: 'Room Consultation', description: 'Free in-store design consultation' },
    { name: 'Assembly Service', description: 'Professional furniture assembly' },
    { name: 'Delivery Service', description: 'White-glove delivery to your door' },
    { name: 'Custom Order', description: 'Bespoke furniture made to your specs' },
    { name: 'Protection Plan', description: 'Furniture protection and warranty' },
    { name: 'Trade-In', description: 'Trade in your old furniture for credit' },
  ],
  health: [
    { name: 'Initial Consultation', description: 'Comprehensive health assessment' },
    { name: 'Follow-Up Appointment', description: 'Progress review and adjustment' },
    { name: 'Telehealth Session', description: 'Remote consultation via video' },
    { name: 'Health Report', description: 'Detailed written health summary' },
    { name: 'Referral Service', description: 'Referral to specialist providers' },
    { name: 'Wellness Package', description: 'Bundled treatment plan' },
  ],
  retail: [
    { name: 'Gift Wrapping', description: 'Professional gift wrapping service' },
    { name: 'Loyalty Points', description: 'Earn points on every purchase' },
    { name: 'Click & Collect', description: 'Order online, pick up in store' },
    { name: 'Layby', description: 'Reserve now, pay over time' },
    { name: 'Gift Card', description: 'Available in any denomination' },
    { name: 'Returns & Exchange', description: 'Hassle-free returns policy' },
  ],
};

const GENERIC_EXPANSION_FALLBACK = [
  { name: 'Consultation', description: 'Free initial consultation' },
  { name: 'Custom Quote', description: 'Get a quote tailored to your needs' },
  { name: 'Express Service', description: 'Priority turnaround available' },
  { name: 'Package Deal', description: 'Bundle services for better value' },
  { name: 'Gift Voucher', description: 'Give the gift of great service' },
  { name: 'Loyalty Discount', description: 'Returning customer discount' },
];

/** Normalize vertical slug / menu vertical string → AI_EXPANSION_VARIATIONS key. `null` = skip alias (use businessType chain). */
const VERTICAL_SLUG_TO_EXPANSION_KEY = {
  signage: 'signage',
  'signage.general': 'signage',
  'retail.signage': 'signage',
  'services.generic': null,
  beauty: 'beauty',
  'beauty.general': 'beauty',
  'retail.beauty': 'beauty',
  automotive: 'automotive',
  'automotive.general': 'automotive',
  furniture: 'furniture',
  'retail.home_garden': 'furniture',
  home: 'furniture',
  health: 'health',
  'health.general': 'health',
  food: 'food',
  'food.generic': 'food',
  'food.general': 'food',
  restaurant: 'food',
  cafe: 'food',
  retail: 'retail',
  'retail.generic': 'retail',
  'retail.general': 'retail',
  fashion: 'fashion',
  'fashion.boutique': 'fashion',
  'fashion.kids': 'fashion',
  'fashion.generic': 'fashion',
};

/**
 * Never use service-style expansion names for food/retail/fashion catalogs.
 * @param {string} verticalKey
 * @param {string} [verticalGroup]
 * @param {string | null | undefined} businessType
 */
function resolveAiExpansionVariations(verticalKey, verticalGroup, businessType) {
  const aliasKey = VERTICAL_SLUG_TO_EXPANSION_KEY[verticalKey];
  const businessTypeKey = typeof businessType === 'string' ? businessType.toLowerCase().trim() : null;
  let variations =
    (aliasKey !== undefined ? AI_EXPANSION_VARIATIONS[aliasKey] : undefined) ??
    (businessTypeKey ? AI_EXPANSION_VARIATIONS[businessTypeKey] : undefined) ??
    AI_EXPANSION_VARIATIONS[verticalKey] ??
    AI_EXPANSION_VARIATIONS[verticalKey.split('.')[0]] ??
    AI_EXPANSION_VARIATIONS[verticalGroup];

  if (Array.isArray(variations) && variations.length > 0) return variations;

  const group = String(verticalGroup || verticalKey.split('.')[0] || '').toLowerCase();
  if (group === 'food') return AI_EXPANSION_VARIATIONS.food;
  if (group === 'fashion') return AI_EXPANSION_VARIATIONS.fashion;
  if (group === 'retail') return AI_EXPANSION_VARIATIONS.fashion ?? AI_EXPANSION_VARIATIONS.retail;
  return GENERIC_EXPANSION_FALLBACK;
}

const AI_EXPANSION_TARGET = CATALOG_ITEM_LIMIT;
const AI_EXPANSION_MIN = CATALOG_ITEM_MIN;
const TARGET_ITEM_COUNT = CATALOG_ITEM_LIMIT;
const MIN_ITEM_COUNT = CATALOG_ITEM_MIN;

/** BSL catalog profiles expose businessType/catalogMode; vertical profiles expose verticalSlug/verticalGroup. */
function isVerticalGenerationProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return Boolean(profile.verticalSlug || profile.verticalGroup);
}

function resolveCatalogClassificationProfile(params = {}) {
  return params.catalogGenerationProfile ?? params.classificationProfile ?? null;
}

function resolveVerticalCatalogProfile(params = {}) {
  const explicitSlug = params.verticalSlug != null ? String(params.verticalSlug).trim() : '';
  const candidate = params.generationProfile ?? params.classificationProfile ?? null;
  const fromCandidate = isVerticalGenerationProfile(candidate) ? candidate : null;
  const categoryHint = params.storeType ?? params.businessType ?? params.category ?? null;

  if (fromCandidate?.verticalSlug || explicitSlug) {
    const slug = explicitSlug || fromCandidate?.verticalSlug || 'services.generic';
    return {
      verticalSlug: slug,
      verticalGroup:
        fromCandidate?.verticalGroup ??
        params.verticalGroup ??
        (String(slug).split('.')[0] || 'services'),
      audience:
        params.audience ??
        fromCandidate?.audience ??
        resolveAudience({ businessType: categoryHint, businessName: params.businessName }),
      keywords: fromCandidate?.keywords ?? [],
      forbiddenKeywords: fromCandidate?.forbiddenKeywords,
      categoryHints: fromCandidate?.categoryHints,
    };
  }

  const r = resolveVertical({
    businessType: categoryHint,
    businessName: params.businessName,
    userNotes: [params.location, params.prompt].filter(Boolean).join(' '),
    explicitVertical: explicitSlug || null,
  });
  if ((r?.slug || 'services.generic') === 'services.generic') {
    console.log('[verticalResolver]', {
      businessName: params.businessName ?? null,
      businessType: categoryHint ?? null,
      location: params.location ?? null,
      chosenSlug: r?.slug ?? null,
      matchedKeywords: Array.isArray(r?.matchedKeywords) ? r.matchedKeywords.slice(0, 8) : [],
    });
  }
  const slug = explicitSlug || r.slug || 'services.generic';
  return {
    verticalSlug: slug,
    verticalGroup: r.group ?? String(slug).split('.')[0] ?? 'services',
    audience:
      params.audience ??
      resolveAudience({ businessType: categoryHint, businessName: params.businessName }),
    keywords: r.matchedKeywords || [],
    forbiddenKeywords: undefined,
    categoryHints: undefined,
  };
}

/**
 * If audience is kids, scan products for forbidden adult keywords. Corrective: if >=2 hits or >10% flagged, return true (caller should rebuild with fashion_kids).
 * @param {{ name?: string, description?: string }[]} products
 * @returns {{ fail: boolean, hitCount: number, flaggedRatio: number }}
 */
function kidsAudienceValidator(products) {
  if (!Array.isArray(products) || products.length === 0) return { fail: false, hitCount: 0, flaggedRatio: 0 };
  let hitCount = 0;
  for (const p of products) {
    const text = `${p.name || ''} ${p.description || ''}`;
    if (KIDS_FORBIDDEN_ADULT.test(text)) hitCount += 1;
  }
  const flaggedRatio = hitCount / products.length;
  const fail = hitCount >= 2 || flaggedRatio > 0.1;
  return { fail, hitCount, flaggedRatio };
}

/**
 * @typedef CatalogBuildResult
 * @property {object} profile - { name, type, tagline?, heroText?, primaryColor?, secondaryColor?, stylePreferences? }
 * @property {{ id: string, name: string }[]} categories
 * @property {{ id: string, name: string, description?: string, price?: string, categoryId: string, imageUrl?: string|null }[]} products
 * @property {{ catalogSource: 'template'|'ai'|'ocr', vertical?: string }} meta
 */

/**
 * Template mode: deterministic profile from template + overrides (NO LLM). Map template catalog to normalized shape.
 * @param {object} params - from resolveGenerationParams; must include draftId, templateId
 * @returns {Promise<CatalogBuildResult>}
 */
export async function buildFromTemplate(params) {
  const { draftId, templateId, businessName, businessType, intent } = params;
  if (!templateId || String(templateId).trim() === '') {
    throw new Error('Template mode requires a valid templateId. Please choose a template.');
  }
  let key = String(templateId).toLowerCase().trim();
  const verticalSlug = params.verticalSlug ?? resolveVerticalSlug(businessType, params.vertical);
  const isFood = verticalSlug === 'food' || (typeof verticalSlug === 'string' && verticalSlug.startsWith('food.'));
  const isFashionOrRetail =
    typeof verticalSlug === 'string' &&
    (verticalSlug === 'fashion' ||
      verticalSlug.startsWith('fashion.') ||
      verticalSlug === 'retail' ||
      verticalSlug.startsWith('retail.'));
  if (key === 'services_generic' && (isFood || isFashionOrRetail)) {
    const redirected = selectTemplateId(verticalSlug, params.audience);
    if (redirected && redirected !== 'services_generic') {
      key = redirected;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildCatalog] template guard: non-service vertical but templateId was services_generic; using', key);
      }
    }
  }
  if (isFood) {
    const cuisineTemplate = cuisineSlugToTemplateKey(verticalSlug);
    if (
      cuisineTemplate &&
      (key === 'food_restaurant_generic' || key === 'restaurant' || key === 'general' || key === 'generic_store')
    ) {
      key = cuisineTemplate;
    }
  }
  if (!isFood && key === 'cafe') {
    key = selectTemplateId(verticalSlug);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[buildCatalog] template guard: non-food vertical but templateId was cafe; using', key);
    }
  }
  let list = getTemplateItems(key);
  if (!list || !Array.isArray(list) || list.length === 0) {
    throw new Error(`Template not found: "${templateId}". Please choose a valid template (e.g. cafe, food_seafood, food_restaurant_generic, food_bakery, beauty_nails, fashion_boutique, fashion_kids, services_generic, florist, retail).`);
  }
  if (list.length < 24) {
    list = expandTemplateItems(key, CATALOG_ITEM_LIMIT);
  }
  const itemsForCatalog = list.slice(0, CATALOG_ITEM_LIMIT);

  const businessProfileMod = await loadBusinessProfileService();
  if (!businessProfileMod) throw tsModuleUnavailable('businessProfileService');
  const getTemplateProfile = businessProfileMod.getTemplateProfile ?? businessProfileMod.default?.getTemplateProfile;
  if (typeof getTemplateProfile !== 'function') throw tsModuleUnavailable('businessProfileService');
  const isPersonalPresence = String(intent || '').trim() === 'personal_presence';
  // For personal presence, avoid forcing a business category/type; keep template's deterministic base type.
  const profile = getTemplateProfile(key, {
    explicitName: businessName,
    ...(isPersonalPresence ? {} : { explicitType: businessType }),
  });

  if (isPersonalPresence) {
    const name = String(profile?.name || businessName || 'My Profile').trim() || 'My Profile';
    // Purely additive tone defaults: keep preview schema unchanged (categories/items remain).
    profile.tagline = profile.tagline || 'Personal profile · portfolio · links';
    profile.heroText =
      profile.heroText ||
      `Welcome — I'm ${name}. Explore my work, links, and how to contact me.`;
    // Bias style toward a personal/portfolio feel without changing downstream contracts.
    profile.stylePreferences = {
      ...(profile.stylePreferences || {}),
      style: (profile.stylePreferences && profile.stylePreferences.style) || 'minimal',
      mood: (profile.stylePreferences && profile.stylePreferences.mood) || 'calm',
    };
  }

  const products = itemsForCatalog.slice(0, CATALOG_ITEM_LIMIT).map((p, i) => ({
    id: `item_${draftId}_${i}`,
    name: p.name || `Item ${i + 1}`,
    description: p.description ?? null,
    price: p.price ?? null,
    categoryId: '', // assigned below
    imageUrl: null,
    ...(p.serviceMode ? { serviceMode: p.serviceMode } : {}),
    ...(p.pricingModel ? { pricingModel: p.pricingModel } : {}),
    ...(p.fromPrice != null ? { fromPrice: p.fromPrice } : {}),
    ...(p.priceUnit ? { priceUnit: p.priceUnit } : {}),
    ...(p.durationMinutes != null ? { durationMinutes: p.durationMinutes } : {}),
    ...(p.estimateDurationLabel ? { estimateDurationLabel: p.estimateDurationLabel } : {}),
    ...(p.isGallery ? { isGallery: true } : {}),
    type: p.isGallery ? 'service' : undefined,
    kind: p.isGallery ? 'service' : undefined,
  }));

  const menuResult = getMenuCategoriesAndAssignments(products, profile.type || '');
  let categories;
  let itemsForPreview;
  if (menuResult) {
    categories = menuResult.categories;
    itemsForPreview = menuResult.items;
  } else {
    const primaryCategoryId = `cat_${draftId}_0`;
    categories = [{ id: primaryCategoryId, name: profile.type || 'General' }];
    products.forEach((p) => { p.categoryId = primaryCategoryId; });
    itemsForPreview = products;
  }

  return {
    profile: {
      name: profile.name,
      type: profile.type,
      tagline: profile.tagline,
      heroText: profile.heroText,
      primaryColor: profile.primaryColor,
      secondaryColor: profile.secondaryColor,
      stylePreferences: profile.stylePreferences,
    },
    categories,
    products: itemsForPreview,
    meta: {
      catalogSource: 'template',
      vertical: profile.type,
      ...(isPersonalPresence
        ? { template: 'personal_presence', category: 'personal', layoutHint: 'profile_card' }
        : {}),
    },
  };
}

/**
 * Seed mode: build catalog from cached/fetched seed items (no template pack). Single category; generic descriptions.
 * Images filled later by existing pipeline (item name + vertical keywords).
 * @param {object} params - draftId, seedItems: { name, description? }[], verticalSlug, businessName, businessType
 * @returns {Promise<CatalogBuildResult>}
 */
export async function buildFromSeed(params) {
  const { draftId, seedItems = [], businessName, businessType } = params;
  const verticalSlug = (params.verticalSlug || '').toString().trim() || 'services.generic';
  const items = Array.isArray(seedItems) ? seedItems.slice(0, CATALOG_ITEM_LIMIT) : [];
  if (items.length === 0) {
    throw new Error('Seed mode requires non-empty seedItems.');
  }
  const primaryCategoryId = `cat_${draftId}_0`;
  const groupLabel = verticalSlug.split('.')[1] || verticalSlug.split('.')[0] || 'General';
  const categoryName = groupLabel.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const businessProfileModSeed = await loadBusinessProfileService();
  if (!businessProfileModSeed) throw tsModuleUnavailable('businessProfileService');
  const getTemplateProfileSeed = businessProfileModSeed.getTemplateProfile ?? businessProfileModSeed.default?.getTemplateProfile;
  if (typeof getTemplateProfileSeed !== 'function') throw tsModuleUnavailable('businessProfileService');
  const profile = getTemplateProfileSeed('services_generic', {
    explicitName: businessName,
    explicitType: businessType || categoryName,
  });
  const products = items.map((it, i) => ({
    id: `item_${draftId}_${i}`,
    name: (it && it.name) ? String(it.name).trim() : `Item ${i + 1}`,
    description: (it && it.description != null) ? String(it.description).trim() : null,
    price: null,
    categoryId: primaryCategoryId,
    imageUrl: null,
  }));
  const categories = [{ id: primaryCategoryId, name: categoryName }];
  if (process.env.NODE_ENV !== 'production') {
    console.log('[buildCatalog] buildFromSeed', { verticalSlug, itemCount: products.length, categoryName });
  }
  const meta = { catalogSource: 'seed', vertical: verticalSlug };
  if (params.classificationProfile) meta.classificationProfile = params.classificationProfile;
  if (params.audience) meta.audience = params.audience;
  return {
    profile: {
      name: profile.name,
      type: profile.type,
      tagline: profile.tagline,
      heroText: profile.heroText,
      primaryColor: profile.primaryColor,
      secondaryColor: profile.secondaryColor,
      stylePreferences: profile.stylePreferences,
    },
    categories,
    products,
    meta,
  };
}

/**
 * AI mode: may call LLM for profile and menu. Returns same normalized shape.
 * @param {object} params - from resolveGenerationParams; must include draftId
 * @returns {Promise<CatalogBuildResult>}
 */
export async function buildFromAi(params) {
  const { draftId, prompt, vertical, businessName, businessType, location, priceTier, storeType, audience, verticalSlug } = params;
  const profileInput = {
    mode: 'ai_description',
    descriptionText: prompt,
    explicitName: businessName,
    explicitType: businessType || storeType,
    regionCode: params.locale || 'en',
  };
  const businessProfileMod = await loadBusinessProfileService();
  if (!businessProfileMod) throw tsModuleUnavailable('businessProfileService');
  const generateBusinessProfile = businessProfileMod.generateBusinessProfile ?? businessProfileMod.default?.generateBusinessProfile;
  if (typeof generateBusinessProfile !== 'function') throw tsModuleUnavailable('businessProfileService');
  const profile = await generateBusinessProfile(profileInput);

  const verticalForMenu = (verticalSlug || vertical || businessType || storeType || profile.type || 'general').toString().trim().toLowerCase().replace(/\s+/g, '_').replace(/\./g, '_');
  const currency =
    (params.currencyCode && String(params.currencyCode).trim().toUpperCase()) ||
    inferCurrencyFromLocationText(location) ||
    'AUD';
  const menuResult = await generateVerticalLockedMenu({
    businessName: profile.name || businessName || 'Store',
    businessType: String(businessType || storeType || profile.type || '').trim(),
    vertical: verticalForMenu,
    verticalSlug: params.verticalSlug || verticalForMenu.replace(/_/g, '.'),
    location: (location || '').toString().trim(),
    priceTier: (priceTier || '').toString().trim(),
    currency,
    draftId,
    audience: audience || undefined,
  });

  let products = (menuResult.items || []).map((item) => ({
    ...item,
    currencyCode: currency,
    ...(item?.priceV1 && typeof item.priceV1 === 'object'
      ? { priceV1: { ...item.priceV1, currencyCode: currency } }
      : {}),
  }));
  if (products.length < AI_EXPANSION_MIN && products.length > 0) {
    const verticalKey = verticalForMenu.replace(/_/g, '.');
    const variations = resolveAiExpansionVariations(
      verticalKey,
      verticalKey.split('.')[0],
      businessType,
    );
    const primaryCategoryId = products[0].categoryId || (menuResult.categories && menuResult.categories[0] && menuResult.categories[0].id) || `cat_${draftId}_0`;
    /** Fill only to minimum viable catalog — not CATALOG_ITEM_LIMIT (avoids 200+ duplicate placeholders). */
    const need = AI_EXPANSION_MIN - products.length;
    const seen = new Set(products.map((p) => normalizeCatalogProductName(p?.name)));
    let guard = 0;
    const maxAttempts = Math.max(need * variations.length, variations.length);
    for (let added = 0; added < need && guard < maxAttempts; guard++) {
      const v = variations[guard % variations.length];
      const key = normalizeCatalogProductName(v.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      products.push({
        id: `item_${draftId}_${products.length}`,
        name: v.name,
        description: v.description ?? null,
        price: null,
        currencyCode: currency,
        categoryId: primaryCategoryId,
        imageUrl: null,
      });
      added += 1;
    }
    if (process.env.NODE_ENV !== 'production' && need > 0) {
      console.log('[buildCatalog] AI expansion to minimum', {
        draftId,
        added: products.length,
        targetMin: AI_EXPANSION_MIN,
      });
    }
  }

  return {
    profile: {
      name: profile.name,
      type: profile.type,
      tagline: profile.tagline,
      heroText: profile.heroText,
      primaryColor: profile.primaryColor,
      secondaryColor: profile.secondaryColor,
      stylePreferences: profile.stylePreferences,
    },
    categories: menuResult.categories,
    products,
    meta: { catalogSource: 'ai', vertical: verticalForMenu, business_profile_source: 'ai' },
  };
}

/**
 * OCR mode: extract products from OCR text; profile via existing OCR path. Map to normalized shape.
 * @param {object} params - from resolveGenerationParams; must include draftId, ocrRawText or photoDataUrl
 * @returns {Promise<CatalogBuildResult>}
 */
export async function buildFromOcr(params) {
  const { draftId, ocrRawText, photoDataUrl, businessName, businessType } = params;
  let ocrText = ocrRawText || null;
  if (!ocrText && photoDataUrl) {
    ocrText = await performMenuOcr(photoDataUrl);
    if (!ocrText || ocrText.trim().length === 0) {
      throw new Error('OCR returned empty text');
    }
  }
  if (!ocrText || ocrText.trim().length === 0) {
    throw new Error('OCR mode requires ocrRawText or photoDataUrl.');
  }

  const businessProfileModOcr = await loadBusinessProfileService();
  if (!businessProfileModOcr) throw tsModuleUnavailable('businessProfileService');
  const generateBusinessProfileOcr = businessProfileModOcr.generateBusinessProfile ?? businessProfileModOcr.default?.generateBusinessProfile;
  if (typeof generateBusinessProfileOcr !== 'function') throw tsModuleUnavailable('businessProfileService');
  const profile = await generateBusinessProfileOcr({
    mode: 'ocr',
    ocrRawText: ocrText,
    explicitName: businessName,
    explicitType: businessType,
    regionCode: params.locale || 'en',
  });

  const lines = ocrText.split('\n').filter((line) => line.trim().length > 0);
  const products = lines.slice(0, CATALOG_ITEM_LIMIT).map((line, idx) => {
    const priceMatch = line.match(/[\$€£¥]\s*[\d,]+\.?\d*/);
    const price = priceMatch ? priceMatch[0] : null;
    const name = line.replace(/[\$€£¥]\s*[\d,]+\.?\d*/g, '').trim();
    return {
      id: `item_${draftId}_${idx}`,
      name: name || `Item ${idx + 1}`,
      description: null,
      price,
      categoryId: 'other',
      imageUrl: null,
    };
  });

  const categories = [{ id: 'other', name: 'Other' }];

  return {
    profile: {
      name: profile.name,
      type: profile.type,
      tagline: profile.tagline,
      heroText: profile.heroText,
      primaryColor: profile.primaryColor,
      secondaryColor: profile.secondaryColor,
      stylePreferences: profile.stylePreferences,
    },
    categories,
    products,
    meta: { catalogSource: 'ocr' },
  };
}


/**
 * Only branching point: dispatch by params.mode. Returns CatalogBuildResult.
 * @param {object} params - must include mode, draftId; templateId for template, prompt/vertical for ai, ocrRawText/photoDataUrl for ocr
 * @returns {Promise<CatalogBuildResult>}
 */
export async function buildCatalog(params) {
  const mode = params.mode;
  const profile = resolveVerticalCatalogProfile(params);
  const verticalSlug =
    profile.verticalSlug ??
    params.verticalSlug ??
    resolveVerticalSlug(params.storeType ?? params.businessType, params.vertical);
  const paramsWithVertical = {
    ...params,
    generationProfile: profile,
    verticalSlug,
    verticalGroup: profile.verticalGroup ?? (verticalSlug || '').split('.')[0],
    audience: profile.audience ?? params.audience,
    keywords: profile.keywords,
    categoryHints: profile.categoryHints,
    forbiddenKeywords: profile.forbiddenKeywords,
  };
  if (process.env.NODE_ENV !== 'production') {
    console.log('[buildCatalog] mode switch', {
      mode,
      verticalSlug: profile.verticalSlug,
      verticalGroup: profile.verticalGroup,
      audience: profile.audience,
      itemTarget: TARGET_ITEM_COUNT,
    });
  }

  let result;
  if (mode === 'template') result = await buildFromTemplate(paramsWithVertical);
  else if (mode === 'seed') result = await buildFromSeed(paramsWithVertical);
  else if (mode === 'ai') result = await buildFromAi(paramsWithVertical);
  else if (mode === 'ocr') result = await buildFromOcr(paramsWithVertical);
  else throw new Error(`Unsupported mode: ${mode}. Use "template", "seed", "ai", or "ocr".`);

  if (result?.products && result.products.length < MIN_ITEM_COUNT) {
    const seedProfile = {
      verticalGroup: (verticalSlug || '').split('.')[0] || profile.verticalGroup || 'services',
      verticalSlug: verticalSlug || profile.verticalSlug || 'services.generic',
      audience: profile.audience,
      businessModel: profile.businessModel,
      businessType: params.businessType ?? profile.businessType,
    };
    const seedResult = buildSeedCatalog(seedProfile, { targetCount: TARGET_ITEM_COUNT });
    const extra = (seedResult.items || []).slice(0, TARGET_ITEM_COUNT - result.products.length);
    const firstCatId = result.categories?.[0]?.id || `cat_${params.draftId}_0`;
    const seenExpand = new Set(
      (result.products || []).map((p) => normalizeCatalogProductName(p?.name)),
    );
    for (let i = 0; i < extra.length; i++) {
      const it = extra[i];
      const key = normalizeCatalogProductName(it?.name);
      if (key && seenExpand.has(key)) continue;
      if (key) seenExpand.add(key);
      result.products.push({
        id: `item_${params.draftId}_expand_${i}`,
        name: it.name || `Item ${result.products.length + 1}`,
        description: it.description ?? null,
        price: it.price ?? null,
        ...(params.currencyCode != null && String(params.currencyCode).trim()
          ? { currencyCode: String(params.currencyCode).trim().toUpperCase() }
          : {}),
        categoryId: it.categoryId || firstCatId,
        imageUrl: null,
      });
    }
    if (process.env.NODE_ENV !== 'production' && extra.length > 0) {
      console.log('[buildCatalog] expanded with seed', { mode, verticalSlug, expandedBy: extra.length, seedSource: seedProfile.verticalGroup });
    }
  }

  if (result?.products && (profile.audience === 'kids' || params.audience === 'kids')) {
    const { fail, hitCount, flaggedRatio } = kidsAudienceValidator(result.products);
    if (fail) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildCatalog] kids validator failed, forcing fashion_kids rebuild', { hitCount, flaggedRatio });
      }
      result = await buildFromTemplate({
        ...paramsWithVertical,
        templateId: 'fashion_kids',
        verticalSlug: 'fashion.kids',
      });
    }
  }

  if (result && verticalSlug) {
    result.optionsSchema = buildOptionsSchema(verticalSlug);
    const catalogForValidation = {
      ...result,
      meta: {
        ...result.meta,
        draftId: params.draftId,
        ...(params.classificationProfile ? { classificationProfile: params.classificationProfile } : {}),
        ...(params.audience ? { audience: params.audience } : {}),
      },
    };
    const validated = await validateAndCorrect({
      verticalSlug,
      catalog: catalogForValidation,
      buildFromTemplate: (p) => buildFromTemplate({ ...paramsWithVertical, ...p }),
      buildFromSeed: (p) => buildFromSeed({ ...paramsWithVertical, ...p }),
    });
    if (validated.corrected) result = validated.catalog;
    if (validated.warnings?.length && result.meta) {
      result.meta.verticalWarnings = validated.warnings;
      result.meta.verticalCorrected = validated.corrected;
    }
  }

  const seedProfile = profile
    ? {
        verticalGroup: profile.verticalGroup ?? (verticalSlug || '').split('.')[0],
        verticalSlug: profile.verticalSlug ?? verticalSlug,
        audience: profile.audience ?? params.audience,
        businessModel: profile.businessModel,
        businessType: profile.businessType ?? params.businessType,
        keywords: profile.keywords,
        forbiddenKeywords: profile.forbiddenKeywords,
      }
    : {
        verticalGroup: (verticalSlug || '').split('.')[0] || '',
        verticalSlug: verticalSlug || '',
        audience: params.audience,
        businessModel: params.businessModel,
        businessType: params.businessType,
      };
  const catalogValidated = await validateAndCorrectCatalog(seedProfile, result, () => buildSeedCatalog(seedProfile, { targetCount: TARGET_ITEM_COUNT }));
  if (catalogValidated.corrected) result = catalogValidated.catalog;
  if (result?.products?.length) {
    const deduped = dedupeCatalogProductsByName(result.products, { logContext: `buildCatalog:${mode}` });
    if (deduped.removedCount > 0) {
      result.products = deduped.products;
    }
  }

  const leakProfile = {
    ...seedProfile,
    businessName: params.businessName,
    storeName: params.businessName,
    storeType: params.storeType ?? params.businessType,
    businessType: params.businessType ?? params.storeType ?? seedProfile.businessType,
    catalogLabel: result?.meta?.catalogLabel,
  };
  const leakRepair = repairServiceCatalogPlaceholderProducts(
    result?.products ?? [],
    leakProfile,
    () => {
      const cuisine = buildCuisineMenuCatalog(leakProfile, TARGET_ITEM_COUNT);
      if (cuisine) return cuisine;
      return buildSeedCatalog(seedProfile, { targetCount: TARGET_ITEM_COUNT });
    },
  );
  if (leakRepair.repaired) {
    result.products = leakRepair.products;
    if (leakRepair.categories?.length) {
      result.categories = leakRepair.categories;
    }
    result.meta = {
      ...(result.meta ?? {}),
      serviceCatalogLeakRepaired: true,
      serviceCatalogLeakRepairedCount: leakRepair.repairedCount,
    };
    if (process.env.NODE_ENV !== 'production') {
      console.log('[buildCatalog] repaired service catalog placeholder leak', {
        mode,
        verticalSlug: seedProfile.verticalSlug,
        repairedCount: leakRepair.repairedCount,
      });
    }
  }

  const catalogProfile =
    resolveCatalogClassificationProfile(params) ??
    buildCatalogGenerationProfile({
      businessName: params.businessName,
      category: params.storeType ?? params.businessType,
      businessType: params.storeType ?? params.businessType,
      storeType: params.storeType ?? params.businessType,
      prompt: params.prompt,
      location: params.location,
      catalogLabel: result?.meta?.catalogLabel,
      items: result?.products,
    });
  if (result?.products?.length) {
    result.products = applyCatalogProfileToItems(result.products, catalogProfile, {
      businessType: catalogProfile.businessType ?? params.canonicalBusinessType ?? params.storeType ?? params.businessType,
      businessName: params.businessName,
    });
    console.log(
      '[catalog_items_generated]',
      JSON.stringify({
        businessType: catalogProfile.businessType,
        itemCount: result.products.length,
        catalogLabel: catalogProfile.catalogLabel,
      }),
    );
  }
  if (
    catalogProfile.suggestedSubcategories?.length &&
    (!Array.isArray(result.categories) || result.categories.length <= 1)
  ) {
    result.categories = buildCategoriesFromProfile(
      catalogProfile.suggestedSubcategories,
      `cat_${params.draftId ?? 'gen'}`,
    );
  }
  result.meta = {
    ...(result.meta ?? {}),
    businessType: catalogProfile.businessType,
    catalogMode: catalogProfile.catalogMode,
    catalogLabel: catalogProfile.catalogLabel,
    generatedContentProfile: catalogProfile.generatedContentProfile,
    primaryCTA: catalogProfile.primaryCTA,
  };

  const itemCount = (result?.products || []).length;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[buildCatalog]', {
      mode,
      slug: profile.verticalSlug ?? verticalSlug,
      audience: profile.audience ?? params.audience,
      itemCount,
      corrected: catalogValidated.corrected,
      reasons: catalogValidated.reasons,
    });
  }
  return result;
}
