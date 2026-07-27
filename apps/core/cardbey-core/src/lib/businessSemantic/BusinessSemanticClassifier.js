/**
 * Business Semantic Classifier — produces classification signals for BusinessProfile.
 */

import { classifyBusinessType, buildBusinessTypeCorpus } from '../catalog/classifyBusinessType.js';

const INDUSTRY_PATTERNS = [
  { industry: 'beauty_wellness', subIndustry: 'nail_salon', re: /\b(nail|manicure|pedicure)\b/i },
  { industry: 'beauty_wellness', subIndustry: 'hair_salon', re: /\b(hair|barber|salon)\b/i },
  { industry: 'beauty_wellness', subIndustry: 'spa', re: /\b(spa|massage|facial|wellness)\b/i },
  { industry: 'trades', subIndustry: 'tiling', re: /\b(til(e|ing)|splashback|grout)\b/i },
  { industry: 'trades', subIndustry: 'flooring', re: /\b(floor(ing)?|timber floor|vinyl)\b/i },
  { industry: 'trades', subIndustry: 'construction', re: /\b(renovation|construct|builder|contractor)\b/i },
  { industry: 'food_hospitality', subIndustry: 'restaurant', re: /\b(restaurant|dining|bistro)\b/i },
  { industry: 'food_hospitality', subIndustry: 'cafe', re: /\b(cafe|coffee|espresso)\b/i },
  { industry: 'food_hospitality', subIndustry: 'bakery', re: /\b(bakery|baker|pastry)\b/i },
  { industry: 'retail', subIndustry: 'fashion', re: /\b(fashion|clothing|apparel|boutique)\b/i },
  { industry: 'retail', subIndustry: 'general', re: /\b(retail|shop|store|merchandise)\b/i },
];

/**
 * @param {import('./types.js').BusinessSemanticInput} input
 */
export function classifyBusinessSemantic(input = {}) {
  const corpus = buildBusinessTypeCorpus({
    businessName: input.businessName ?? input.storeName,
    storeName: input.storeName,
    category: input.category,
    businessType: input.businessType ?? input.storeType,
    description: input.description,
    prompt: input.prompt ?? input.userPrompt,
    documentText: input.documentText ?? input.ocrRawText ?? input.cardText,
    website: input.website,
    location: input.location,
    detectedServices: input.detectedServices,
    detectedProducts: input.detectedProducts,
    items: input.items,
  });

  const typeResult = classifyBusinessType({
    businessName: input.businessName ?? input.storeName,
    storeName: input.storeName,
    category: input.category,
    businessType: input.businessType ?? input.storeType,
    description: input.description,
    prompt: input.prompt ?? input.userPrompt,
    documentText: input.documentText ?? input.ocrRawText ?? input.cardText,
    location: input.location,
    detectedServices: input.detectedServices,
    detectedProducts: input.detectedProducts,
    items: input.items,
  });

  let industry = 'general';
  let subIndustry = null;
  for (const row of INDUSTRY_PATTERNS) {
    if (row.re.test(corpus)) {
      industry = row.industry;
      subIndustry = row.subIndustry;
      break;
    }
  }

  if (typeResult.businessType === 'food_menu') industry = 'food_hospitality';
  if (typeResult.businessType === 'product_retail') industry = industry === 'general' ? 'retail' : industry;
  if (
    typeResult.businessType === 'service_fixed_booking' ||
    typeResult.businessType === 'service_quote_required'
  ) {
    if (industry === 'general') industry = 'services';
  }

  return {
    businessType: typeResult.businessType,
    confidence: typeResult.confidence,
    reasoning: typeResult.reasoning,
    corpus,
    industry,
    subIndustry,
    suggestedSubcategories: typeResult.suggestedSubcategories ?? [],
    typeClassification: typeResult,
  };
}
