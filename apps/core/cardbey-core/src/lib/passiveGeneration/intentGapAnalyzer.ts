/**
 * Intent structuring + gap detection.
 *
 * Converts raw inputs (text, URLs, uploads, discovery candidates, social handles)
 * into StructuredIntent, then detects missing data fields with acquisition strategy hints.
 */

export type IntentType =
  | 'create_business_surface'
  | 'create_website'
  | 'create_storefront'
  | 'enrich_catalog'
  | 'find_supplier'
  | 'create_demand'
  | 'create_promotion'
  | 'unknown';

export type DesiredOutcome =
  | 'storefront'
  | 'website'
  | 'business_profile'
  | 'catalog'
  | 'feed_card'
  | 'offer_draft'
  | 'recommendation'
  | 'supplier_record'
  | 'content_pack';

export type EntityField =
  | 'businessName'
  | 'businessType'
  | 'category'
  | 'address'
  | 'location'
  | 'phone'
  | 'email'
  | 'website'
  | 'openingHours'
  | 'menu'
  | 'pricing'
  | 'services'
  | 'heroMedia'
  | 'logo'
  | 'brandColors'
  | 'socialLinks'
  | 'reviews'
  | 'socialProof'
  | 'geo'
  | 'mediaAssets'
  | 'supplierCandidates';

export interface StructuredIntent {
  intentType: IntentType;
  entities: Record<string, unknown>;
  desiredOutcome: DesiredOutcome[];
  missingFields: EntityField[];
  confidence: number;
  rawText?: string | null;
}

export type GapPriority = 'critical' | 'high' | 'medium' | 'low';

export type AcquisitionTaskType =
  | 'search_business'
  | 'fetch_website'
  | 'extract_metadata'
  | 'search_media'
  | 'extract_menu'
  | 'search_social'
  | 'discover_reviews'
  | 'find_brand_assets'
  | 'find_location_data'
  | 'find_supplier_candidates';

export interface DataGap {
  field: EntityField;
  priority: GapPriority;
  acquisitionTask: AcquisitionTaskType;
  minConfidence: number;
  reason: string;
}

export interface IntentInput {
  text?: string | null;
  urls?: string[];
  uploads?: Array<{ type: 'menu' | 'business_card' | 'photo' | 'scan'; name?: string }>;
  discoveryCandidateIds?: string[];
  socialHandles?: Record<string, string>;
  voiceTranscript?: string | null;
  /** Pre-extracted entities from upstream (OCR, discovery import, etc.). */
  entities?: Record<string, unknown>;
}

const BUSINESS_TYPE_PATTERNS: Array<{ re: RegExp; type: string }> = [
  { re: /\bcoffee\s*shop|\bcafe\b|\bespresso\b/i, type: 'cafe' },
  { re: /\brestaurant\b|\bdiner\b|\bbistro\b/i, type: 'restaurant' },
  { re: /\bhair\s*salon|\bsalon\b|\bbarber\b/i, type: 'hair_salon' },
  { re: /\bnail\s*salon|\bmanicure\b/i, type: 'nail_salon' },
  { re: /\bwedding\s*photographer|\bphotographer\b/i, type: 'photographer' },
  { re: /\bbakery\b|\bbaker\b/i, type: 'bakery' },
  { re: /\bgym\b|\bfitness\b/i, type: 'fitness' },
];

function clean(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length ? t : null;
}

function extractBusinessName(text: string): string | null {
  const patterns = [
    /(?:create|build|make|start)\s+(?:a\s+)?(?:page|store|website|storefront|cardbey\s+page)\s+for\s+(.+?)(?:\.|$|,|\s+in\s+)/i,
    /(?:create|build|make)\s+(?:a\s+)?(?:page|store|website)\s+for\s+["']?([^"'.]+)["']?/i,
    /^(.+?)\s+(?:melbourne|sydney|brisbane|australia)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) return clean(m[1]);
  }
  return null;
}

function extractBusinessType(text: string): string | null {
  for (const { re, type } of BUSINESS_TYPE_PATTERNS) {
    if (re.test(text)) return type;
  }
  return null;
}

function extractLocation(text: string): string | null {
  const m = /\b(?:in|at|near)\s+([A-Z][a-zA-Z\s,]+(?:VIC|NSW|QLD|AU|Australia)?)/i.exec(text);
  return m ? clean(m[1]) : null;
}

function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(s.trim()) || /\.[a-z]{2,}(\/|$)/i.test(s.trim());
}

/** Heuristic intent structuring (Phase 1 — no LLM required). */
export function structureIntent(input: IntentInput): StructuredIntent {
  const parts = [
    input.text,
    input.voiceTranscript,
    ...(input.urls ?? []),
  ].filter(Boolean) as string[];
  const rawText = parts.join(' ').trim() || null;

  const entities: Record<string, unknown> = { ...(input.entities ?? {}) };

  if (input.socialHandles) entities.socialLinks = input.socialHandles;
  if (input.urls?.length) entities.website = input.urls.find(looksLikeUrl) ?? input.urls[0];
  if (input.uploads?.length) {
    entities.uploads = input.uploads;
    if (input.uploads.some((u) => u.type === 'menu')) entities.hasMenuUpload = true;
  }

  let intentType: IntentType = 'unknown';
  const desiredOutcome: DesiredOutcome[] = [];
  let confidence = 0.4;

  const lower = (rawText ?? '').toLowerCase();

  if (/\b(upload|menu photo|menu image|scan menu)\b/i.test(lower) || entities.hasMenuUpload) {
    intentType = 'enrich_catalog';
    desiredOutcome.push('catalog', 'feed_card');
    confidence = 0.65;
  } else if (/\b(need|looking for|find|hire)\s+(?:a\s+)?(.+?(?:photographer|plumber|caterer|supplier))/i.test(lower)) {
    intentType = 'create_demand';
    desiredOutcome.push('recommendation', 'supplier_record');
    confidence = 0.55;
  } else if (/\b(create|build|make|start)\s+(?:a\s+)?(?:page|store|website|storefront|cardbey)/i.test(lower)) {
    intentType = 'create_business_surface';
    if (/\bwebsite\b/i.test(lower)) {
      desiredOutcome.push('website', 'business_profile');
    } else {
      desiredOutcome.push('storefront', 'feed_card', 'business_profile');
    }
    confidence = 0.6;
  } else if (/\b(coffee shop|restaurant|salon|cafe)\s+website\b/i.test(lower) || /\bi want a .+ website\b/i.test(lower)) {
    intentType = 'create_website';
    desiredOutcome.push('website', 'storefront');
    confidence = 0.55;
  }

  if (rawText) {
    const name = extractBusinessName(rawText);
    if (name) {
      entities.businessName = name;
      confidence += 0.1;
    }
    const type = extractBusinessType(rawText);
    if (type) {
      entities.businessType = type;
      entities.category = type;
      confidence += 0.08;
    }
    const loc = extractLocation(rawText);
    if (loc) {
      entities.location = loc;
      confidence += 0.05;
    }
  }

  if (intentType === 'unknown' && Object.keys(entities).length > 0) {
    intentType = 'create_business_surface';
    desiredOutcome.push('storefront');
  }

  const intent: StructuredIntent = {
    intentType,
    entities,
    desiredOutcome: desiredOutcome.length ? desiredOutcome : ['storefront'],
    missingFields: [],
    confidence: Math.min(1, confidence),
    rawText,
  };

  intent.missingFields = detectMissingData(intent).map((g) => g.field);
  return intent;
}

/** Field requirements per intent type. */
const GAP_CATALOG: Record<
  EntityField,
  { priority: GapPriority; task: AcquisitionTaskType; minConfidence: number; reason: string }
> = {
  businessName: { priority: 'critical', task: 'search_business', minConfidence: 0.6, reason: 'Name identifies the business' },
  businessType: { priority: 'high', task: 'extract_metadata', minConfidence: 0.5, reason: 'Category drives templates and feed lane' },
  category: { priority: 'high', task: 'search_business', minConfidence: 0.5, reason: 'Category for discovery and feed' },
  address: { priority: 'high', task: 'find_location_data', minConfidence: 0.55, reason: 'Address for local discovery' },
  location: { priority: 'high', task: 'find_location_data', minConfidence: 0.5, reason: 'Geo context for nearby exposure' },
  phone: { priority: 'medium', task: 'fetch_website', minConfidence: 0.5, reason: 'Contact for profile completeness' },
  email: { priority: 'low', task: 'extract_metadata', minConfidence: 0.4, reason: 'Optional contact' },
  website: { priority: 'medium', task: 'fetch_website', minConfidence: 0.55, reason: 'Website enriches metadata' },
  openingHours: { priority: 'medium', task: 'fetch_website', minConfidence: 0.5, reason: 'Hours for storefront' },
  menu: { priority: 'high', task: 'extract_menu', minConfidence: 0.6, reason: 'Menu for food/catalog artifacts' },
  pricing: { priority: 'medium', task: 'extract_menu', minConfidence: 0.5, reason: 'Pricing for offers' },
  services: { priority: 'medium', task: 'extract_metadata', minConfidence: 0.5, reason: 'Service list for profile' },
  heroMedia: { priority: 'high', task: 'search_media', minConfidence: 0.45, reason: 'Hero image/video for storefront' },
  logo: { priority: 'medium', task: 'find_brand_assets', minConfidence: 0.45, reason: 'Logo for brand identity' },
  brandColors: { priority: 'low', task: 'find_brand_assets', minConfidence: 0.35, reason: 'Colors for theme' },
  socialLinks: { priority: 'low', task: 'search_social', minConfidence: 0.4, reason: 'Social proof links' },
  reviews: { priority: 'low', task: 'discover_reviews', minConfidence: 0.45, reason: 'Reviews for trust' },
  socialProof: { priority: 'low', task: 'discover_reviews', minConfidence: 0.4, reason: 'Social proof snippets' },
  geo: { priority: 'high', task: 'find_location_data', minConfidence: 0.5, reason: 'Coordinates for nearby lane' },
  mediaAssets: { priority: 'medium', task: 'search_media', minConfidence: 0.4, reason: 'Gallery media' },
  supplierCandidates: { priority: 'critical', task: 'find_supplier_candidates', minConfidence: 0.5, reason: 'Suppliers for demand intent' },
};

function entityHasField(entities: Record<string, unknown>, field: EntityField): boolean {
  switch (field) {
    case 'businessName':
      return Boolean(clean(entities.businessName as string) || clean(entities.name as string));
    case 'businessType':
    case 'category':
      return Boolean(clean(entities.businessType as string) || clean(entities.category as string));
    case 'address':
      return Boolean(clean(entities.address as string));
    case 'location':
    case 'geo':
      return Boolean(clean(entities.location as string) || entities.lat != null);
    case 'phone':
      return Boolean(clean(entities.phone as string));
    case 'email':
      return Boolean(clean(entities.email as string));
    case 'website':
      return Boolean(clean(entities.website as string));
    case 'openingHours':
      return Boolean(entities.openingHours);
    case 'menu':
      return Boolean(entities.menu || entities.hasMenuUpload || entities.menuItems);
    case 'pricing':
      return Boolean(entities.pricing || entities.menuItems);
    case 'services':
      return Boolean(entities.services);
    case 'heroMedia':
      return Boolean(entities.heroMedia || entities.heroImageUrl);
    case 'logo':
      return Boolean(entities.logo || entities.logoUrl);
    case 'brandColors':
      return Boolean(entities.brandColors || entities.primaryColor);
    case 'socialLinks':
      return Boolean(entities.socialLinks && typeof entities.socialLinks === 'object');
    case 'reviews':
      return Boolean(entities.reviews || entities.reviewCount);
    case 'socialProof':
      return Boolean(entities.socialProof || entities.rating);
    case 'mediaAssets':
      return Boolean(Array.isArray(entities.mediaAssets) && entities.mediaAssets.length);
    case 'supplierCandidates':
      return Boolean(Array.isArray(entities.supplierCandidates) && entities.supplierCandidates.length);
    default:
      return false;
  }
}

/** Fields required for a given intent + outcome. */
function requiredFieldsForIntent(intent: StructuredIntent): EntityField[] {
  const base: EntityField[] = [];
  const { intentType, desiredOutcome } = intent;
  const foodish = ['cafe', 'restaurant', 'bakery'].includes(String(intent.entities.businessType ?? ''));

  if (intentType === 'create_demand' || intentType === 'find_supplier') {
    return ['supplierCandidates', 'category', 'location'];
  }

  if (intentType === 'enrich_catalog') {
    return ['menu', 'businessName', 'category', 'pricing'];
  }

  base.push('businessName', 'category', 'heroMedia');

  if (desiredOutcome.includes('storefront') || desiredOutcome.includes('website')) {
    base.push('address', 'location', 'openingHours', 'phone', 'website', 'geo');
  }
  if (desiredOutcome.includes('website')) {
    base.push('logo', 'brandColors', 'mediaAssets');
  }
  if (foodish || desiredOutcome.includes('catalog')) {
    base.push('menu', 'pricing');
  }
  if (desiredOutcome.includes('feed_card')) {
    base.push('socialProof', 'reviews');
  }
  if (desiredOutcome.includes('offer_draft')) {
    base.push('pricing', 'services');
  }

  return [...new Set(base)];
}

/**
 * Detect missing data gaps with priority, acquisition task, and confidence requirement.
 */
export function detectMissingData(intent: StructuredIntent): DataGap[] {
  const required = requiredFieldsForIntent(intent);
  const gaps: DataGap[] = [];

  for (const field of required) {
    if (entityHasField(intent.entities, field)) continue;
    const spec = GAP_CATALOG[field];
    gaps.push({
      field,
      priority: spec.priority,
      acquisitionTask: spec.task,
      minConfidence: spec.minConfidence,
      reason: spec.reason,
    });
  }

  const priorityOrder: Record<GapPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  return gaps;
}

export { detectMissingData as detectMissingDataFromIntent };
