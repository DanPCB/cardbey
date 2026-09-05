/**
 * Locked BusinessContext for store generation — wraps existing BSL + vertical + blueprint signals.
 * Downstream catalog / website / CTA / hero stages should prefer this over re-guessing.
 */

import { classifyBusinessType, PROFESSIONAL_RE } from '../../lib/catalog/classifyBusinessType.js';
import { classifyBusinessSemantic } from '../../lib/businessSemantic/BusinessSemanticClassifier.js';
import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { resolveIndustryBlueprintKey } from './industryBlueprintRegistry.js';
import { resolveStoreCreationMode } from '../../lib/storeCreation/storeCreationMode.js';

/**
 * @typedef {'KNOWN'|'INFERRED'|'UNKNOWN'} KnowledgeState
 */

/**
 * @param {object} input
 * @returns {object} BusinessContext
 */
export function buildStoreGenerationBusinessContext(input = {}) {
  const businessName = String(input.businessName ?? input.storeName ?? '').trim();
  const typedCategory = String(
    input.primaryCategory ?? input.category ?? input.businessType ?? input.storeType ?? '',
  ).trim();

  const semantic = classifyBusinessSemantic({
    businessName,
    storeName: businessName,
    category: typedCategory,
    businessType: input.businessType ?? input.storeType,
    description: input.description,
    prompt: input.prompt ?? input.rawInput,
    documentText: input.documentText ?? input.ocrRawText,
    location: input.location,
    detectedServices: input.detectedServices,
    detectedProducts: input.detectedProducts,
    items: input.items,
  });

  const typeResult = semantic.typeClassification ?? classifyBusinessType({
    businessName,
    category: typedCategory,
    businessType: input.businessType ?? input.storeType,
    description: input.description,
    prompt: input.prompt ?? input.rawInput,
    documentText: input.documentText ?? input.ocrRawText,
    location: input.location,
    items: input.items,
  });

  // Resolve vertical from name + human category first — never feed canonical enum
  // strings like `service_fixed_booking` (they false-match `services.generic`).
  let vertical = resolveVertical({
    businessType: typedCategory || (PROFESSIONAL_RE.test(businessName) ? 'finance' : '') || '',
    businessName,
  });
  if (
    PROFESSIONAL_RE.test(`${businessName} ${typedCategory}`) &&
    (!vertical?.slug || vertical.slug === 'services.generic')
  ) {
    const legal = /\b(lawyer|legal|solicitor|attorney|conveyanc)\b/i.test(`${businessName} ${typedCategory}`);
    const accounting = /\b(accountant|accounting|bookkeep|tax)\b/i.test(`${businessName} ${typedCategory}`);
    vertical = {
      group: 'services',
      slug: legal ? 'services.legal' : accounting ? 'services.accounting' : 'services.finance',
      confidence: 0.85,
      matchedKeywords: ['professional_name_override'],
    };
  }

  const blueprintKey = resolveIndustryBlueprintKey({
    businessName,
    storeName: businessName,
    businessType: typedCategory,
    storeType: typedCategory,
    verticalSlug: vertical.slug,
    verticalGroup: vertical.group,
  });

  const professional = PROFESSIONAL_RE.test(`${businessName} ${typedCategory} ${semantic.corpus || ''}`);

  const modeDecision = resolveStoreCreationMode(
    {
      businessName,
      category: typedCategory,
      location: input.location,
      websiteUrl: input.websiteUrl ?? input.website,
      cardImageDataUrl: input.cardImageDataUrl,
      hasOwnerMedia: input.hasOwnerMedia,
      documentText: input.documentText ?? input.ocrRawText,
    },
    input.researchSummary ?? null,
    vertical,
  );

  /** @type {KnowledgeState} */
  const categoryState = typedCategory ? 'KNOWN' : vertical.slug ? 'INFERRED' : 'UNKNOWN';

  return {
    businessId: input.businessId ?? null,
    businessName: businessName || null,
    primaryCategory: typedCategory || vertical.label || null,
    secondaryCategories: [],
    industry: semantic.industry ?? 'general',
    subIndustry: semantic.subIndustry ?? null,
    businessType: typeResult.businessType,
    description: input.description ?? null,
    productsOrServices: input.detectedServices ?? input.detectedProducts ?? null,
    audience: input.audience ?? null,
    geography: input.location ?? null,
    operatingModel: professional ? 'professional_services' : typeResult.businessType,
    commerceModel: typeResult.catalogMode,
    conversionGoals: [typeResult.primaryCTA].filter(Boolean),
    brandContext: {
      tone: professional ? 'professional' : 'friendly',
      positioning: semantic.subIndustry || semantic.industry || null,
      visualDirection: professional ? 'corporate_office' : null,
    },
    evidence: [],
    confidence: typeResult.confidence,
    knowledge: {
      primaryCategory: categoryState,
      offerings: Array.isArray(input.items) && input.items.length ? 'KNOWN' : 'UNKNOWN',
      geography: input.location ? 'KNOWN' : 'UNKNOWN',
    },
    verticalSlug: vertical.slug || null,
    verticalGroup: vertical.group || null,
    verticalConfidence: vertical.confidence ?? null,
    insufficientUnderstanding: vertical.insufficientUnderstanding === true,
    creationMode: modeDecision.creationMode,
    creationModeReason: modeDecision.reason,
    needsClarification: modeDecision.needsClarification === true,
    clarificationPrompt: modeDecision.clarificationPrompt ?? null,
    clarificationOptions: modeDecision.clarificationOptions ?? null,
    industryBlueprintKey: blueprintKey || null,
    primaryCTA: typeResult.primaryCTA,
    catalogMode: typeResult.catalogMode,
    generatedContentProfile: typeResult.generatedContentProfile,
    lockedAt: new Date().toISOString(),
  };
}

/**
 * Persist context onto draft.input / preview.meta (non-destructive merge).
 * @param {object} target
 * @param {object} ctx
 */
export function attachBusinessContextToDraftInput(target, ctx) {
  if (!target || typeof target !== 'object' || !ctx) return target;
  target.storeGenerationBusinessContext = ctx;
  target.classificationProfile = {
    ...(target.classificationProfile && typeof target.classificationProfile === 'object'
      ? target.classificationProfile
      : {}),
    businessType: ctx.businessType,
    primaryCTA: ctx.primaryCTA,
    catalogMode: ctx.catalogMode,
    generatedContentProfile: ctx.generatedContentProfile,
    verticalSlug: ctx.verticalSlug,
    verticalGroup: ctx.verticalGroup,
    industry: ctx.industry,
    confidence: ctx.confidence,
  };
  target.verticalSlug = target.verticalSlug || ctx.verticalSlug;
  target.verticalGroup = target.verticalGroup || ctx.verticalGroup;
  return target;
}
