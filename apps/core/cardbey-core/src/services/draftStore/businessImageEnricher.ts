/**
 * BusinessImageEnricher — strengthens draft image search / generation context
 * for performer console + ReAct media step (finalizeDraft → generateImageForDraftItem).
 *
 * Heuristics plus optional LLM vertical fallback: merges vertical/store signals into ImageFillProfile.keywords
 * and can synthesize a minimal profile when classification profile is missing.
 */
import type { ImageFillProfile } from '../menuVisualAgent/menuVisualAgent.js';

/** Future ReAct / registry id when this becomes a discrete planner step. */
export const BUSINESS_IMAGE_ENRICHER_TOOL_ID = 'business_image_enrich' as const;

export type BusinessImageEnricherInput = {
  profile?: ImageFillProfile | null;
  storeName?: string | null;
  businessType?: string | null;
  location?: string | null;
};

/** HTTP / tool JSON body (maps to core enricher fields). */
export type BusinessImageEnricherHttpInput = {
  businessName?: string;
  businessType?: string;
  location?: string;
  classifierProfile?: Record<string, unknown> | null;
};

export type BusinessImageEnricherResult = {
  profile: ImageFillProfile | null;
  /** Keywords or phrases newly suggested (for logs / blackboard). */
  addedTerms: string[];
};

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'with',
  'in',
  'on',
  'of',
  'to',
  'for',
  'pty',
  'ltd',
  'llc',
  'inc',
  'intl',
]);

function dedupeKeywords(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const t = (raw || '').toLowerCase().trim();
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(raw.trim());
  }
  return out;
}

function tokensFromStoreName(name: string): string[] {
  return (name || '')
    .split(/[^a-zA-Z0-9]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4 && !STOP.has(s.toLowerCase()))
    .slice(0, 4);
}

function tokensFromLocation(loc: string): string[] {
  return (loc || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && !STOP.has(s.toLowerCase()))
    .slice(0, 2);
}

/** Visual search boosters from a lowercase blob (store + vertical + location). */
function verticalBoosterTerms(blob: string): string[] {
  const out: string[] = [];
  const push = (...xs: string[]) => {
    for (const x of xs) if (x && !out.includes(x)) out.push(x);
  };
  if (
    /furniture|timber|wood|interior|decor|flooring|renovation|blinds|curtains|garden|bedroom|dining|living|kitchen|showroom|upholster/.test(
      blob,
    )
  ) {
    push('showroom', 'interior', 'furniture', 'home decor');
  }
  if (/pho|vietnamese|viet nam|noodle house|banh|bun bo|com tam|spring roll|saigon|hanoi/.test(blob)) {
    push('Vietnamese', 'pho', 'noodle soup', 'restaurant');
  }
  if (/cafe|restaurant|food|bakery|coffee|bistro|bar|catering|kitchen|cuisine/.test(blob)) {
    push('restaurant', 'fresh food', 'plated');
  }
  if (/salon|spa|beauty|hair|nail|cosmetic|skincare|barber/.test(blob)) {
    push('salon', 'beauty', 'spa');
  }
  if (/fashion|clothing|apparel|boutique|textile|garment/.test(blob)) {
    push('fashion', 'apparel', 'retail');
  }
  if (/sport|fitness|gym|athletic|yoga|training/.test(blob)) {
    push('fitness', 'sport', 'activewear');
  }
  if (/electron|tech|computer|gadget|mobile|phone|audio/.test(blob)) {
    push('electronics', 'technology');
  }
  if (/health|medical|clinic|pharma|dental|wellness/.test(blob)) {
    push('healthcare', 'clinic');
  }
  if (/art|craft|handmade|hobby|stationery/.test(blob)) {
    push('arts', 'craft', 'creative');
  }
  if (/auto|car|vehicle|mechanic|tyre|tire/.test(blob)) {
    push('automotive', 'vehicle');
  }
  if (/sign|signage|display|billboard|banner/i.test(blob)) {
    push('signage', 'business sign', 'storefront', 'LED display', 'outdoor advertising');
  }
  return out;
}

function inferVerticalSlug(blob: string): string {
  if (/sign|signage|display|billboard|banner/i.test(blob)) {
    return 'signage';
  }
  if (/furniture|timber|wood|flooring|garden|home|interior|decor|bedroom|kitchen|living|blinds|curtains/.test(blob)) {
    return 'retail.home_garden';
  }
  if (/cafe|restaurant|food|bakery|coffee|bistro|bar/.test(blob)) return 'food.generic';
  if (/salon|spa|beauty|hair|nail/.test(blob)) return 'beauty.generic';
  if (/fashion|clothing|apparel|boutique/.test(blob)) return 'fashion.generic';
  if (/sport|fitness|gym/.test(blob)) return 'retail.sports';
  if (/electron|tech|computer|gadget/.test(blob)) return 'retail.electronics';
  return 'retail.generic';
}

function coerceClassifierProfile(raw: unknown): ImageFillProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const verticalSlug = typeof o.verticalSlug === 'string' ? o.verticalSlug : '';
  const verticalGroup =
    typeof o.verticalGroup === 'string' &&
    (o.verticalGroup === 'food' || o.verticalGroup === 'services' || o.verticalGroup === 'retail')
      ? o.verticalGroup
      : undefined;
  const keywords = Array.isArray(o.keywords) ? (o.keywords.filter((x) => typeof x === 'string') as string[]) : undefined;
  const forbiddenKeywords = Array.isArray(o.forbiddenKeywords)
    ? (o.forbiddenKeywords.filter((x) => typeof x === 'string') as string[])
    : undefined;
  const audience = typeof o.audience === 'string' ? o.audience : undefined;
  const categoryHints = Array.isArray(o.categoryHints)
    ? (o.categoryHints.filter((x) => typeof x === 'string') as string[])
    : undefined;
  if (!verticalSlug && !(keywords?.length || categoryHints?.length)) return null;
  return {
    verticalSlug,
    verticalGroup,
    keywords,
    forbiddenKeywords,
    audience,
    categoryHints,
  };
}

function isHttpInput(x: BusinessImageEnricherInput | BusinessImageEnricherHttpInput): x is BusinessImageEnricherHttpInput {
  if (!x || typeof x !== 'object') return false;
  if ('storeName' in x) return false;
  return 'businessName' in x;
}

function inferVerticalGroup(slug: string): 'food' | 'services' | 'retail' {
  const s = (slug || '').toLowerCase();
  if (s === 'signage' || s.startsWith('signage.')) return 'retail';
  const top = s.split('.')[0] || '';
  if (top === 'food') return 'food';
  if (top === 'beauty' || top === 'fashion') return 'retail';
  if (top === 'retail') return 'retail';
  return 'services';
}

const LLM_VERTICAL_TO_SLUG: Record<string, string> = {
  food: 'food.generic',
  beauty: 'beauty.generic',
  furniture: 'retail.home_garden',
  fitness: 'retail.sports',
  technology: 'retail.electronics',
  automotive: 'retail.generic',
  retail: 'retail.generic',
  health: 'retail.generic',
  arts: 'retail.generic',
  education: 'retail.generic',
  signage: 'signage',
  hospitality: 'food.generic',
  professional: 'retail.generic',
  general: 'retail.generic',
};

/** When keyword heuristics leave the vertical unknown, ask the LLM for a coarse industry label. */
async function inferVerticalWithLlm(businessName: string, businessType: string): Promise<string> {
  try {
    const { llmGateway } = await import('../../lib/llm/llmGateway.ts');
    const name = String(businessName ?? '').trim();
    const typ = String(businessType ?? '').trim();
    const result = await llmGateway.generate({
      purpose: 'draft_store_business_vertical_infer',
      tenantKey: 'business-image-enricher',
      prompt: `You are a business classifier. Return only one word.

Business name: "${name.replace(/"/g, '\\"')}"
Business type: "${typ.replace(/"/g, '\\"')}"
What is the primary industry vertical?
Reply with ONLY one of these exact words:
automotive, beauty, food, furniture, fitness,
retail, health, arts, technology, education,
signage, hospitality, professional, general`,
      maxTokens: 10,
      temperature: 0,
      responseFormat: 'text',
    });
    const raw = String(result?.text ?? '').trim().toLowerCase();
    const valid = new Set(Object.keys(LLM_VERTICAL_TO_SLUG));
    const words = raw
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z]/g, ''))
      .filter(Boolean);
    let key = 'general';
    for (const w of words) {
      if (valid.has(w)) {
        key = w;
        break;
      }
    }
    return LLM_VERTICAL_TO_SLUG[key] ?? 'retail.generic';
  } catch {
    return 'retail.generic';
  }
}

/**
 * Merge business context into an ImageFillProfile for Pexels / OpenAI draft paths.
 * Returns null when there is nothing to add and no base profile (caller keeps legacy opts).
 */
export async function enrichImageFillProfileForBusiness(
  input: BusinessImageEnricherInput,
): Promise<BusinessImageEnricherResult> {
  const blob = [
    input.storeName,
    input.businessType,
    input.location,
    input.profile?.verticalSlug,
    ...(input.profile?.keywords ?? []),
    ...(input.profile?.categoryHints ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const boosted = verticalBoosterTerms(blob);
  const nameToks = tokensFromStoreName(String(input.storeName ?? ''));
  const locToks = tokensFromLocation(String(input.location ?? ''));
  /** Food / restaurant: put vertical boosters before store-name tokens so cuisine cues (e.g. Vietnamese pho) stay in the first keyword window. */
  const foodishBlob =
    /food\.|restaurant|cafe|bakery|noodle|pho|vietnamese|viet |bistro|coffee|banh|bun|kitchen|cuisine/.test(blob);
  const merged = dedupeKeywords(
    foodishBlob
      ? [...(input.profile?.keywords ?? []), ...boosted, ...nameToks, ...locToks]
      : [...(input.profile?.keywords ?? []), ...nameToks, ...locToks, ...boosted],
  ).slice(0, 8);

  const hasBaseProfile = input.profile != null;
  if (!hasBaseProfile && merged.length === 0) {
    return { profile: null, addedTerms: [] };
  }

  let verticalSlug =
    hasBaseProfile && input.profile!.verticalSlug?.trim()
      ? input.profile!.verticalSlug.trim()
      : inferVerticalSlug(blob);

  const businessName = String(input.storeName ?? '').trim();
  if (
    (verticalSlug === 'retail.generic' || verticalSlug === 'general') &&
    businessName.length > 2
  ) {
    verticalSlug = await inferVerticalWithLlm(businessName, String(input.businessType ?? ''));
    console.log('[BusinessImageEnricher] LLM vertical:', { businessName, verticalSlug });
  }

  const base: ImageFillProfile = hasBaseProfile
    ? {
        ...input.profile!,
        verticalSlug: input.profile!.verticalSlug?.trim() || verticalSlug,
        verticalGroup: input.profile!.verticalGroup ?? inferVerticalGroup(verticalSlug),
        keywords: merged.length ? merged : [...(input.profile!.keywords ?? [])],
        forbiddenKeywords: input.profile!.forbiddenKeywords,
        audience: input.profile!.audience,
        categoryHints: dedupeKeywords([
          ...(input.profile!.categoryHints ?? []),
          ...(locToks.length ? [locToks.join(' ')] : []),
        ]).slice(0, 6),
      }
    : {
        verticalSlug,
        verticalGroup: inferVerticalGroup(verticalSlug),
        keywords: merged,
        forbiddenKeywords: [],
        audience: undefined,
        categoryHints: locToks,
      };

  const prevKw = hasBaseProfile ? (input.profile?.keywords ?? []) : [];
  const addedTerms = dedupeKeywords([...boosted, ...nameToks, ...locToks]).filter(
    (t) => !prevKw.some((k) => k.toLowerCase() === t.toLowerCase()),
  );

  if (process.env.NODE_ENV !== 'production' && (addedTerms.length || boosted.length)) {
    console.log('[BusinessImageEnricher]', { addedTerms: addedTerms.slice(0, 8), verticalSlug: base.verticalSlug });
  }

  return { profile: base, addedTerms };
}

export type RunBusinessImageEnricherToolResult = {
  ok: true;
  /** Same as profile; primary field for HTTP / ReAct consumers. */
  effectiveImageFillProfile: ImageFillProfile | null;
  keywords: string[];
  /** True when heuristics added tokens or synthesized a profile. */
  enrichmentApplied: boolean;
  addedTerms: string[];
  profile: ImageFillProfile | null;
};

/**
 * ReAct + HTTP entry: accepts core `{ storeName, profile, … }` or HTTP `{ businessName, classifierProfile, … }`.
 */
export async function runBusinessImageEnricherTool(
  input: BusinessImageEnricherInput | BusinessImageEnricherHttpInput,
): Promise<RunBusinessImageEnricherToolResult> {
  const normalized: BusinessImageEnricherInput = isHttpInput(input)
    ? {
        storeName: input.businessName ?? null,
        businessType: input.businessType ?? null,
        location: input.location ?? null,
        profile: coerceClassifierProfile(input.classifierProfile ?? null),
      }
    : (input as BusinessImageEnricherInput);

  const hadProfile = normalized.profile != null;
  const r = await enrichImageFillProfileForBusiness(normalized);
  const effective = r.profile;
  const keywords = effective?.keywords ?? [];
  const enrichmentApplied = Boolean(
    r.addedTerms.length > 0 || (!hadProfile && effective != null) || (hadProfile && effective && keywords.length > (normalized.profile?.keywords?.length ?? 0)),
  );

  return {
    ok: true,
    effectiveImageFillProfile: effective,
    keywords,
    enrichmentApplied,
    addedTerms: r.addedTerms,
    profile: effective,
  };
}
