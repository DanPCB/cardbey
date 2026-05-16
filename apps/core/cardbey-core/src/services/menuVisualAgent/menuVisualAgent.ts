/**
 * MenuVisualAgent Orchestrator
 * Main service that generates images for menu items
 *
 * Default: free/legal sources first (Pexels, then Unsplash). AI (OpenAI) is fallback only to avoid token burn and unrealistic product images.
 * Flow:
 * 1. Load store/business (get style preferences)
 * 2. Load products (filter by itemIds or all without images)
 * 3. For each product: try Pexels → Unsplash → fallback to OpenAI
 * 4. Update Product.images JSON + imageUrl
 */

import { prisma } from '../../lib/prisma.js';
import { searchUnsplashImage, isUnsplashAvailable } from './unsplashService.js';
import { searchPexelsImage, searchPexelsImages, isPexelsAvailable } from './pexelsService.js';
import { generateMenuItemImage, isOpenAIImageAvailable } from './openaiImageService.js';
import { getStylePreset, STYLE_PRESETS } from './stylePresets.js';

/** Style name for draft-item image generation (no Prisma) */
export type DraftItemStyleName = 'modern' | 'warm' | 'minimal' | 'vibrant';

export interface ImageGenerationResult {
  processed: number;
  succeeded: number;
  failed: number;
  details: Array<{
    itemId: string;
    itemName: string;
    success: boolean;
    source?: 'pexels' | 'unsplash' | 'openai';
    error?: string;
  }>;
}

/**
 * Generate images for menu items
 * 
 * @param storeId - Store/Business ID
 * @param itemIds - Optional array of product IDs to process. If undefined, processes all items without images
 * @returns Summary of processed items
 */
export async function generateImagesForMenu(
  storeId: string,
  itemIds?: string[]
): Promise<ImageGenerationResult> {
  const result: ImageGenerationResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    details: [],
  };

  try {
    // Get style preset for this business
    const style = await getStylePreset(storeId);
    console.log('[MenuVisualAgent] Using style preset:', style.name);

    // Load products
    const whereClause: any = {
      businessId: storeId,
      deletedAt: null,
    };

    // If itemIds provided, filter by them
    if (itemIds && itemIds.length > 0) {
      whereClause.id = { in: itemIds };
    } else {
      // Otherwise, only process items without images
      whereClause.OR = [
        { imageUrl: null },
        { images: null },
      ];
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        images: true,
      },
    });

    console.log(`[MenuVisualAgent] Processing ${products.length} items for store ${storeId}`);

    // Process each product
    for (const product of products) {
      result.processed++;

      try {
        // Free sources first (no token burn). AI is fallback only.
        let imageResult: { url: string; source: 'pexels' | 'unsplash' | 'openai'; metadata?: any } | null = null;

        if (isPexelsAvailable()) {
          const query = [product.name, style.name].filter(Boolean).join(' ').trim().slice(0, 200);
          const pexelsUrl = await searchPexelsImage(query);
          if (pexelsUrl) {
            imageResult = {
              url: pexelsUrl,
              source: 'pexels',
              metadata: { provider: 'Pexels' },
            };
          }
        }

        if (!imageResult && isUnsplashAvailable()) {
          const unsplashResult = await searchUnsplashImage(product.name, style.name as any);
          if (unsplashResult) {
            imageResult = {
              url: unsplashResult.url,
              source: 'unsplash',
              metadata: {
                attribution: unsplashResult.attribution,
                photographer: unsplashResult.photographer,
                photographerUrl: unsplashResult.photographerUrl,
              },
            };
          }
        }

        if (!imageResult && isOpenAIImageAvailable()) {
          const openaiResult = await generateMenuItemImage(
            product.name,
            product.description,
            style.name as any
          );
          if (openaiResult) {
            imageResult = {
              url: openaiResult.url,
              source: 'openai',
              metadata: {
                prompt: openaiResult.prompt,
                generatedAt: new Date().toISOString(),
              },
            };
          }
        }

        if (imageResult) {
          // Update product with image
          const existingImages = Array.isArray(product.images) ? (product.images as any[]) : [];
          const newImageEntry = {
            url: imageResult.url,
            source: imageResult.source,
            ...imageResult.metadata,
            addedAt: new Date().toISOString(),
          };

          // Add to images array (keep existing if any)
          const updatedImages = [...existingImages, newImageEntry];

          await prisma.product.update({
            where: { id: product.id },
            data: {
              imageUrl: imageResult.url, // Set primary image
              images: updatedImages, // Store full array with metadata
            },
          });

          result.succeeded++;
          result.details.push({
            itemId: product.id,
            itemName: product.name,
            success: true,
            source: imageResult.source,
          });

          console.log(`[MenuVisualAgent] ✅ Generated image for "${product.name}" via ${imageResult.source}`);
        } else {
          // No image source available
          result.failed++;
          result.details.push({
            itemId: product.id,
            itemName: product.name,
            success: false,
            error: 'No image source available (Pexels, Unsplash and OpenAI all unavailable or no match)',
          });

          console.warn(`[MenuVisualAgent] ⚠️  No image generated for "${product.name}" (no sources available)`);
        }
      } catch (itemError: any) {
        // Log error but continue processing other items
        result.failed++;
        result.details.push({
          itemId: product.id,
          itemName: product.name,
          success: false,
          error: itemError.message || 'Unknown error',
        });

        console.error(`[MenuVisualAgent] ❌ Error processing "${product.name}":`, itemError.message);
      }
    }

    console.log(`[MenuVisualAgent] Complete: ${result.succeeded}/${result.processed} succeeded`);
    return result;
  } catch (error: any) {
    console.error('[MenuVisualAgent] Fatal error:', error);
    throw error; // Re-throw fatal errors (should be caught by job queue)
  }
}

/** Style keywords for Pexels search (short, no long text). */
const STYLE_SEARCH_KEYWORDS: Record<DraftItemStyleName, string> = {
  modern: 'modern professional',
  warm: 'warm cozy',
  minimal: 'minimal clean',
  vibrant: 'vibrant colorful',
};

/** Minimal profile for image query: vertical + keywords + forbidden + audience. */
export interface ImageFillProfile {
  verticalSlug: string;
  /** Optional. Drives prompt template: food | services | retail. Derived from verticalSlug if missing. */
  verticalGroup?: string;
  keywords?: string[];
  forbiddenKeywords?: string[];
  audience?: string;
  categoryHints?: string[];
}

/** Map verticalSlug (e.g. services.generic, food.cafe) to image prompt group. */
function verticalGroupForImage(verticalSlug: string): 'food' | 'services' | 'retail' {
  const top = (verticalSlug || '').split('.')[0]?.toLowerCase() || '';
  if (top === 'food') return 'food';
  if (top === 'beauty' || top === 'fashion') return 'retail';
  if (top === 'retail') return 'retail';
  return 'services';
}

/** Options for generateImageForDraftItem: context for query + guards. */
export interface GenerateImageForDraftItemOptions {
  profile?: ImageFillProfile;
  categoryHint?: string | null;
  categoryName?: string | null;
  businessType?: string | null;
  location?: string | null;
  usedUrls?: Set<string> | string[];
  allowNullOnLowConfidence?: boolean;
  /** When set with {@link imageEnrichmentStatus} `web_scrape`, rotate through these URLs instead of Pexels. */
  preloadedImageUrls?: string[];
  /** Index into {@link preloadedImageUrls} (typically catalog item index). */
  itemIndex?: number;
  imageEnrichmentStatus?: string;
  preloadedImageConfidence?: number;
}

/**
 * Build image search query from generationProfile.
 * When profile.keywords exist (e.g. from business_image_enrich), they lead the query; item name is a short
 * qualifier (first two words) so generic product titles do not drown vertical/store signals.
 * Strips forbiddenKeywords; for audience=kids ensures "kids" or "children" and applies kids-safe sanitization.
 */
export function buildImageQuery(
  profile: ImageFillProfile,
  itemName: string,
  categoryHint?: string | null,
  styleKeywords?: string
): string {
  const slug = (profile.verticalSlug || '').trim().toLowerCase().replace(/\./g, ' ');
  const forbidden = new Set((profile.forbiddenKeywords || []).map((k) => k.toLowerCase().trim()));
  const audience = (profile.audience || '').toLowerCase();

  const profileKeywords = (profile.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  const itemQualifier = itemName
    ? itemName
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ')
    : '';
  const ch = (categoryHint || '').trim();

  let parts: string[];
  if (profileKeywords.length > 0) {
    parts = [...profileKeywords.slice(0, 4)];
    if (ch && !parts.some((p) => p.toLowerCase().includes(ch.toLowerCase()))) {
      parts.push(ch);
    }
    if (itemQualifier) parts.push(itemQualifier);
    if (slug) parts.push(slug);
  } else {
    parts = [slug, ch, itemName || ''].filter(Boolean);
  }

  let query = parts.join(' ').replace(/\s+/g, ' ').trim();
  forbidden.forEach((term) => {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    query = query.replace(re, ' ');
  });
  query = query.replace(/\s+/g, ' ').trim();

  if (audience === 'kids') {
    if (!/\b(kids|children|child|toddler|baby)\b/i.test(query)) {
      query = `kids children ${query}`.trim();
    }
    if (KIDS_FORBIDDEN_QUERY.test(query)) {
      const safeName = (itemName || 'clothing').replace(KIDS_FORBIDDEN_QUERY, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      query = `kids ${safeName} children clothing`.trim();
    }
  }

  if (styleKeywords) query = `${query} ${styleKeywords}`.trim();
  return query.slice(0, 200);
}

/** Result of generateImageForDraftItem: url + source + metadata for assignment. */
export interface GenerateImageForDraftItemResult {
  url: string;
  source: 'pexels' | 'openai' | 'web_scrape';
  query: string;
  confidence: number;
  providerId?: string;
  meta?: Record<string, unknown>;
}

const DEBUG_IMAGE = process.env.DEBUG_IMAGE_ASSIGNMENT === '1' || process.env.DEBUG_IMAGE_ASSIGNMENT === 'true';

function buildImageQueryForItem(
  name: string,
  categoryName?: string | null,
  businessType?: string | null,
  location?: string | null,
  verticalGroup?: string | null
): string {
  const parts: string[] = [name.trim()];
  if (categoryName && String(categoryName).trim()) parts.push(String(categoryName).trim());
  if (businessType && String(businessType).trim()) parts.push(String(businessType).trim());
  if (location && String(location).trim()) parts.push(String(location).trim());
  const suffix =
    verticalGroup === 'services'
      ? 'professional service'
      : verticalGroup === 'retail'
        ? 'product photography'
        : 'food photo';
  parts.push(suffix);
  return parts.join(', ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'in', 'on', 'of', 'to', 'for', '&']);

function normalize(s: string): string {
  return (s || '').toLowerCase();
}

function isDrinkItem(nameLower: string): boolean {
  return ['water', 'juice', 'tea', 'coffee', 'soda', 'soft drink', 'lemonade', 'sparkling'].some((t) => nameLower.includes(t));
}

function hasDrinkCue(textLower: string): boolean {
  const cues = [
    'drink', 'beverage', 'cup', 'glass', 'mug', 'bottle', 'can',
    'water', 'juice', 'tea', 'coffee', 'soda', 'lemonade', 'sparkling',
    'iced', 'ice', 'latte', 'espresso', 'cola',
  ];
  return cues.some((c) => textLower.includes(c));
}

function tokenize(s: string): string[] {
  return (s || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function violatesFoodMismatch(itemName: string, candidateText: string): boolean {
  const nameLower = normalize(itemName);
  const textLower = normalize(candidateText);

  const drinkTokens = ['water', 'juice', 'tea', 'coffee', 'soda', 'soft drink', 'lemonade', 'sparkling'];
  const drinkBanned = [
    'bread', 'bun', 'baguette', 'loaf', 'toast', 'sandwich',
    'cake', 'pastry', 'dessert', 'croissant', 'muffin', 'cupcake', 'cookie', 'biscuit', 'pie', 'tart',
    'steak', 'salad', 'burger', 'pizza', 'pasta', 'noodles', 'rice',
    'baked', 'bakery', 'baking', 'dough', 'crumb', 'sourdough',
  ];

  if (drinkTokens.some((t) => nameLower.includes(t)) && drinkBanned.some((b) => textLower.includes(b))) {
    return true;
  }

  const breadTokens = ['bread', 'baguette', 'toast', 'garlic bread'];
  const breadBanned = ['coffee', 'tea', 'drink', 'soda', 'juice', 'water', 'lemonade'];
  if (breadTokens.some((t) => nameLower.includes(t)) && breadBanned.some((b) => textLower.includes(b))) {
    return true;
  }

  if (nameLower.includes('salad') && ['cake', 'pastry', 'dessert', 'cookie', 'muffin', 'cupcake'].some((b) => textLower.includes(b))) {
    return true;
  }

  return false;
}

const CATEGORY_TOKENS = ['drink', 'dessert', 'bread', 'pastry', 'salad', 'soup', 'main', 'appetizer', 'beverage'];

function scorePexelsCandidate(
  candidate: { url: string; alt?: string },
  itemName: string,
  categoryName: string | undefined,
  _usedUrls: Set<string>
): number {
  let score = 0.5;
  const altTitle = (candidate.alt || '').toLowerCase();
  const nameLower = normalize(itemName);
  const textLower = altTitle;
  const nameTokens = tokenize(itemName);
  if (nameTokens.length > 0 && nameTokens.some((t) => altTitle.includes(t))) score += 0.2;
  if (categoryName && CATEGORY_TOKENS.some((t) => categoryName.toLowerCase().includes(t) && altTitle.includes(t))) score += 0.1;
  if (violatesFoodMismatch(itemName, altTitle)) score -= 0.4;
  if (isDrinkItem(nameLower) && !hasDrinkCue(textLower)) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

const PEXELS_CANDIDATE_LIMIT = 12;
/** Min confidence to accept a Pexels result (avoid AI fallback). Default 0.45 so more real photos are used; set IMAGE_PEXELS_MIN_CONFIDENCE in env to override. */
const MIN_CONFIDENCE_ACCEPT =
  typeof process.env.IMAGE_PEXELS_MIN_CONFIDENCE !== 'undefined'
    ? Math.max(0.2, Math.min(0.9, parseFloat(process.env.IMAGE_PEXELS_MIN_CONFIDENCE) || 0.45))
    : 0.45;

/**
 * Generate one image for a draft item. Free sources (Pexels) first; AI (OpenAI) fallback only to reduce token use and prefer real product-like photos.
 */
export async function generateImageForDraftItem(
  name: string,
  description?: string,
  styleName?: 'modern' | 'warm' | 'minimal' | 'vibrant',
  options?: GenerateImageForDraftItemOptions
): Promise<GenerateImageForDraftItemResult | null> {
  try {
    const usedSet = options?.usedUrls instanceof Set ? options.usedUrls : new Set(Array.isArray(options?.usedUrls) ? options.usedUrls : []);
    const preloaded = options?.preloadedImageUrls;
    if (
      Array.isArray(preloaded) &&
      preloaded.length > 0 &&
      options?.imageEnrichmentStatus === 'web_scrape'
    ) {
      const unusedPreloaded = preloaded.filter(
        (u) =>
          typeof u === 'string' &&
          u.trim() &&
          /^https?:\/\//i.test(u) &&
          !usedSet.has(u.trim())
      );
      const url = unusedPreloaded[0]?.trim() ?? '';
      if (url) {
        const conf =
          typeof options?.preloadedImageConfidence === 'number' && Number.isFinite(options.preloadedImageConfidence)
            ? Math.max(0, Math.min(1, options.preloadedImageConfidence))
            : 0.85;
        return {
          url,
          source: 'web_scrape',
          query: 'preloaded',
          confidence: conf,
        };
      }
    }

    if (!isPexelsAvailable() && !isOpenAIImageAvailable()) return null;

    const style = styleName && styleName in STYLE_PRESETS ? STYLE_PRESETS[styleName] : STYLE_PRESETS.modern;
    const styleKey = style.name as DraftItemStyleName;
    const styleKeywords = STYLE_SEARCH_KEYWORDS[styleKey] || STYLE_SEARCH_KEYWORDS.modern;

    let query: string;
    if (options?.profile) {
      query = buildImageQuery(
        options.profile,
        name,
        options.categoryHint ?? options.categoryName ?? null,
        styleKeywords
      );
    } else {
      query = buildImageQueryForItem(
        name,
        options?.categoryName ?? options?.categoryHint ?? null,
        options?.businessType ?? null,
        options?.location ?? null
      );
      const descSnippet = description ? description.trim().slice(0, 40).replace(/\s+/g, ' ') : '';
      if (descSnippet) query = `${query}, ${descSnippet}`.slice(0, 200);
      query = `${query} ${styleKeywords}`.trim().slice(0, 200);
    }

    const itemTokens = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['with', 'and', 'for', 'the', 'from'].includes(w))
      .slice(0, 2)
      .join(' ')
      .trim();
    if (itemTokens && !query.toLowerCase().startsWith(itemTokens)) {
      query = `${itemTokens} ${query}`.trim().slice(0, 200);
    }

    if (process.env.CARDBEY_DEBUG_IMAGE_QUERY === '1' && options?.profile) {
      const kw = options.profile.keywords;
      const ch = options.categoryHint ?? options.categoryName ?? null;
      console.log('[ImageQuery] final query:', query, '| profile keywords:', kw, '| categoryHint:', ch);
    }

    if (isPexelsAvailable()) {
      const candidates = await searchPexelsImages(query, PEXELS_CANDIDATE_LIMIT);
      const categoryName = options?.categoryName ?? options?.categoryHint ?? undefined;
      const scored = candidates.map((c) => ({
        ...c,
        score: scorePexelsCandidate(c, name, categoryName, usedSet),
      }));
      const available = scored.filter((c) => !usedSet.has(c.url));
      const pool = available.length > 0 ? available : scored;
      const sorted = [...pool].sort((a, b) => b.score - a.score);
      const winner = sorted[0];
      if (winner) {
        const candidateText = winner.alt || '';
        if (DEBUG_IMAGE) {
          const nameLower = normalize(name);
          const textLower = normalize(candidateText);
          console.log('[DEBUG_IMAGE_ASSIGNMENT]', {
            itemName: name,
            candidateText: candidateText.slice(0, 80),
            isDrink: isDrinkItem(nameLower),
            hasDrinkCue: hasDrinkCue(textLower),
            violatesFoodMismatch: violatesFoodMismatch(name, candidateText),
            confidence: winner.score,
          });
        }
        if (winner.score >= MIN_CONFIDENCE_ACCEPT) {
          return {
            url: winner.url,
            source: 'pexels',
            query,
            confidence: winner.score,
            providerId: winner.id?.toString(),
            meta: winner.alt ? { alt: winner.alt } : undefined,
          };
        }
      }
    }

    if (isOpenAIImageAvailable()) {
      const vGroup =
        options?.profile?.verticalGroup === 'services' || options?.profile?.verticalGroup === 'retail'
          ? options.profile.verticalGroup
          : options?.profile?.verticalSlug
            ? verticalGroupForImage(options.profile.verticalSlug)
            : undefined;
      const openaiResult = await generateMenuItemImage(
        options?.profile ? query : name,
        options?.profile ? null : (description ?? null),
        styleKey,
        vGroup
      );
      if (openaiResult) {
        return { url: openaiResult.url, source: 'openai', query, confidence: 0.7, meta: { prompt: openaiResult.prompt } };
      }
    }

    if (options?.allowNullOnLowConfidence) return null;
    return null;
  } catch (err: any) {
    if (err?.code === 'BILLING_HARD_LIMIT') throw err;
    return null;
  }
}

/**
 * Generate a single image URL for a draft store item (no Prisma).
 * Default: free source (Pexels) first; AI (DALL·E) fallback only.
 * When options.profile is provided, query is built from verticalSlug + categoryHint + item name + keywords,
 * with forbiddenKeywords removed and audience=kids filter applied. Otherwise uses name + description + style.
 * Never throws; returns null on error.
 */
export async function generateImageUrlForDraftItem(
  name: string,
  description?: string,
  styleName?: 'modern' | 'warm' | 'minimal' | 'vibrant',
  options?: { profile?: ImageFillProfile; categoryHint?: string | null } & Partial<GenerateImageForDraftItemOptions>
): Promise<string | null> {
  const result = await generateImageForDraftItem(name, description, styleName, options);
  return result?.url ?? null;
}

/** Candidate shape for suggest-images preview (multiple choices) */
export interface ImageCandidateForSuggest {
  url: string;
  thumbnailUrl: string;
  attribution: {
    provider: string;
    photoUrl: string;
    photographer: string;
    photographerUrl: string;
  };
  confidence: number;
}

/** For audience=kids: reject or sanitize query if it contains these (avoids adult/irrelevant image results). */
const KIDS_FORBIDDEN_QUERY = /\blingerie\b|\bbikini\b|\bgym\b|yoga pose|adult model|nightlife\b|\bheels\b|dress shirt|formal suit|leather boots\b|workwear\b/i;

function sanitizeSearchForKids(text: string, itemName: string): string {
  if (!text || !KIDS_FORBIDDEN_QUERY.test(text)) {
    return (text || '') + ' kids children clothing';
  }
  const safeName = itemName.replace(KIDS_FORBIDDEN_QUERY, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'clothing';
  return `kids ${safeName} children clothing`.slice(0, 200);
}

/**
 * Generate multiple image candidates for a draft item (for suggest-images preview).
 * Uses Pexels multi-search first; if none, falls back to single OpenAI result so at least one candidate is returned.
 * When audience==='kids', search query is sanitized and biased to kids/children to avoid adult/irrelevant images.
 * @param limit - Max candidates to return (default 8)
 * @param audience - When 'kids', filters query and appends kids-safe terms
 */
export async function generateImageCandidatesForDraftItem(
  name: string,
  description?: string,
  styleName?: 'modern' | 'warm' | 'minimal' | 'vibrant',
  limit: number = 8,
  audience?: string | null
): Promise<ImageCandidateForSuggest[]> {
  const candidates: ImageCandidateForSuggest[] = [];
  try {
    const style = styleName && styleName in STYLE_PRESETS
      ? STYLE_PRESETS[styleName]
      : STYLE_PRESETS.modern;
    const styleKey = style.name as DraftItemStyleName;
    const styleKeywords = STYLE_SEARCH_KEYWORDS[styleKey] || STYLE_SEARCH_KEYWORDS.modern;
    const descSnippet = description ? description.trim().slice(0, 40).replace(/\s+/g, ' ') : '';
    let searchText = [name, descSnippet, styleKeywords].filter(Boolean).join(' ').slice(0, 200);
    if ((audience || '').toString().toLowerCase() === 'kids') {
      searchText = sanitizeSearchForKids(searchText, name);
    }

    if (isPexelsAvailable()) {
      const pexelsResults = await searchPexelsImages(searchText, limit);
      for (const p of pexelsResults) {
        candidates.push({
          url: p.url,
          thumbnailUrl: p.thumbnailUrl,
          attribution: {
            provider: 'Pexels',
            photoUrl: p.url,
            photographer: p.photographer ?? '',
            photographerUrl: p.photographerUrl ?? '',
          },
          confidence: 1,
        });
      }
    }
    if (candidates.length === 0 && isOpenAIImageAvailable()) {
      const openaiResult = await generateMenuItemImage(name, description ?? null, styleKey);
      if (openaiResult) {
        candidates.push({
          url: openaiResult.url,
          thumbnailUrl: openaiResult.url,
          attribution: {
            provider: 'OpenAI',
            photoUrl: openaiResult.url,
            photographer: '',
            photographerUrl: '',
          },
          confidence: 0.9,
        });
      }
    }
  } catch {
    // return whatever we have
  }
  return candidates;
}