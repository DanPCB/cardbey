/**
 * Business Understanding Engine — canonical contract types.
 * Separates business meaning, rules, brand identity, and layout structure.
 */

/** @typedef {'business_card'|'loyalty_card'|'menu'|'promotion_flyer'|'poster'|'voucher'|'coupon'|'gift_card'|'price_list'|'product_sheet'|'receipt'|'invoice'|'event_ticket'|'unknown'} BueArtifactType */

/** @typedef {'OBSERVED'|'INFERRED'|'GENERATED'|'OWNER_EDITED'|'IMPORTED'|'APPROVED'} ConfidenceSource */

/** @typedef {'faithful_reconstruction'|'brand_consistent'|'brand_inspired'} BrandAdaptationMode */

/** @typedef {'desktop'|'mobile'|'wallet'|'tv'|'pos'|'qr_landing'|'print_pdf'} RenderChannel */

/**
 * @template T
 * @typedef {{
 *   value: T;
 *   confidence: number;
 *   source: ConfidenceSource;
 * }} GovernedValue
 */

/**
 * @typedef {{
 *   artifactType: BueArtifactType;
 *   confidence: number;
 *   possibleAlternatives: Array<{ artifactType: BueArtifactType; confidence: number }>;
 *   classifiedAt: string;
 *   method: string;
 * }} ArtifactClassification
 */

/**
 * @typedef {{
 *   schema: 'cb-layout';
 *   version: 'v1';
 *   rows?: number | null;
 *   columns?: number | null;
 *   purchaseCellCount?: number | null;
 *   rewardCellCount?: number | null;
 *   footerText?: GovernedValue<string> | null;
 *   headerText?: GovernedValue<string> | null;
 *   logoPresent?: GovernedValue<boolean> | null;
 *   backgroundPattern?: GovernedValue<string> | null;
 *   iconStyle?: GovernedValue<string> | null;
 *   typographyBlocks?: GovernedValue<string[]> | null;
 *   cells?: Array<{ row: number; column: number; role: string; label?: string }>;
 *   evidence?: Record<string, unknown> | null;
 * }} LayoutContract
 */

/**
 * @typedef {{
 *   schema: 'cb-intent';
 *   version: 'v1';
 *   primaryIntent: GovernedValue<string>;
 *   secondaryIntents?: GovernedValue<string[]>;
 * }} IntentContract
 */

/**
 * @typedef {{
 *   schema: 'cb-business-rule';
 *   version: 'v1';
 *   earningRule?: {
 *     action: string;
 *     item: string;
 *     required: number;
 *     confidence: number;
 *     source: ConfidenceSource;
 *   } | null;
 *   reward?: {
 *     type: string;
 *     item: string;
 *     quantity: number;
 *     confidence: number;
 *     source: ConfidenceSource;
 *   } | null;
 *   rawRuleSummary?: GovernedValue<string> | null;
 * }} BusinessRuleContract
 */

/**
 * @typedef {{
 *   schema: 'cb-brand';
 *   version: 'v1';
 *   brandName?: GovernedValue<string> | null;
 *   logo?: GovernedValue<{ description?: string; url?: string }> | null;
 *   primaryColors?: GovernedValue<string[]> | null;
 *   secondaryColors?: GovernedValue<string[]> | null;
 *   typography?: GovernedValue<string> | null;
 *   visualMood?: GovernedValue<string[]> | null;
 *   shapes?: GovernedValue<string> | null;
 *   spacingRhythm?: GovernedValue<string> | null;
 *   composition?: GovernedValue<string> | null;
 *   iconStyle?: GovernedValue<string> | null;
 *   backgroundTexture?: GovernedValue<string> | null;
 *   photographyStyle?: GovernedValue<string> | null;
 *   illustrationStyle?: GovernedValue<string> | null;
 *   toneOfLanguage?: GovernedValue<string> | null;
 * }} BrandProfile
 */

/**
 * @typedef {{
 *   schema: 'cb-artifact';
 *   version: 'v1';
 *   artifactType: BueArtifactType;
 *   classification: ArtifactClassification;
 *   sourceImageRef?: string | null;
 *   storeId?: string | null;
 *   missionId?: string | null;
 *   evidenceId?: string | null;
 *   extractedAt: string;
 * }} ArtifactContract
 */

/**
 * @typedef {{
 *   artifact: ArtifactContract;
 *   layout: LayoutContract | null;
 *   businessRule: BusinessRuleContract | null;
 *   brand: BrandProfile | null;
 *   intent: IntentContract | null;
 *   adaptationMode: BrandAdaptationMode;
 *   pipelineVersion: string;
 *   extractedAt: string;
 * }} CanonicalUnderstandingBundle
 */

/**
 * @typedef {{
 *   headline: string;
 *   checkpoints: Array<{ label: string; ok: boolean; detail?: string }>;
 *   readyForReview: boolean;
 *   adaptationMode: BrandAdaptationMode;
 * }} MerchantUnderstandingSummary
 */

export const BUE_ARTIFACT_TYPES = Object.freeze([
  'business_card',
  'loyalty_card',
  'menu',
  'promotion_flyer',
  'poster',
  'voucher',
  'coupon',
  'gift_card',
  'price_list',
  'product_sheet',
  'receipt',
  'invoice',
  'event_ticket',
  'unknown',
]);

export const CONFIDENCE_SOURCES = Object.freeze([
  'OBSERVED',
  'INFERRED',
  'GENERATED',
  'OWNER_EDITED',
  'IMPORTED',
  'APPROVED',
]);

export const BRAND_ADAPTATION_MODES = Object.freeze([
  'faithful_reconstruction',
  'brand_consistent',
  'brand_inspired',
]);

export const BUE_PIPELINE_VERSION = 'bue-v1';

export default {
  BUE_ARTIFACT_TYPES,
  CONFIDENCE_SOURCES,
  BRAND_ADAPTATION_MODES,
  BUE_PIPELINE_VERSION,
};
