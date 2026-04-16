/**
 * Business Card → Smart Store pipeline.
 *
 * Full 7-step pipeline: Validate → Enrich → Vertical → Content →
 * Catalog → Draft → Context.
 *
 * Never throws — each step is individually guarded.
 */

import { resolveContent } from '../contentResolution/contentResolver.js';
import { resolveVertical, resolveAudience } from '../verticals/verticalTaxonomy.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { getPrismaClient } from '../prisma.js';

// ── Keyword map for businessType inference from card text/name ───────────────
const BUSINESS_TYPE_KEYWORD_MAP = [
  { pattern: /restaurant|cafe|coffee|food|dining/i, type: 'Food & Drink' },
  { pattern: /fashion|clothing|apparel|boutique/i, type: 'Fashion' },
  { pattern: /beauty|salon|spa|nails|hair/i, type: 'Beauty' },
  { pattern: /construction|construct|builder|trade|plumbing/i, type: 'Construction' },
  { pattern: /tech|software|digital|web\b|IT\b/i, type: 'Technology' },
  { pattern: /health|medical|clinic|dental|physio/i, type: 'Health' },
  { pattern: /furniture|homewares?|interior|decor|sofa|mattress|table|cabinet|living room|bedroom/i, type: 'Furniture & Homewares' },
];

function inferBusinessType(rawText, businessName) {
  const text = [businessName, rawText].filter((value) => typeof value === 'string' && value.trim()).join(' ');
  for (const { pattern, type } of BUSINESS_TYPE_KEYWORD_MAP) {
    if (pattern.test(text)) return type;
  }
  return 'General';
}

/**
 * Emit a reasoning line via emitContextUpdate, swallowing errors.
 * @param {Function|undefined} emitContextUpdate
 * @param {string} line
 */
async function emitLine(emitContextUpdate, line) {
  if (typeof emitContextUpdate !== 'function') return;
  await emitContextUpdate({
    reasoning_line: { line, timestamp: Date.now() },
  }).catch(() => {});
}

/**
 * Build a Smart Store from a parsed business card.
 *
 * @param {string|null} missionId
 * @param {{
 *   businessName: string,
 *   businessType?: string,
 *   phone?: string,
 *   email?: string,
 *   website?: string,
 *   address?: string,
 *   tagline?: string,
 *   rawText?: string,
 * }} cardData
 * @param {{
 *   emitContextUpdate?: Function,
 *   userId: string,
 *   tenantId: string,
 * }} options
 * @returns {Promise<{
 *   draftId?: string,
 *   storeId?: string,
 *   summary?: object,
 *   error?: string,
 *   partial?: boolean,
 * }>}
 */
export async function buildSmartStoreFromCard(missionId, cardData, options = {}) {
  const { emitContextUpdate, userId, tenantId } = options;
  const prisma = getPrismaClient();

  // ── Collected state ────────────────────────────────────────────────────────
  let resolvedBusinessName = 'My Business';
  let resolvedBusinessType = 'General';
  let enrichedProfile = null;
  let scrapedData = null;
  let verticalSlug = 'services.generic';
  let verticalGroup = 'services';
  let audience = 'general';
  let sloganResult = { content: '', source: 'fallback' };
  let heroTextResult = { content: '', source: 'fallback' };
  let taglineResult = { content: '', source: 'fallback' };
  let catalog = null;
  let draftId = null;

  // ── STEP 1 — Validate card data ────────────────────────────────────────────
  await emitLine(emitContextUpdate, '🪪 Reading business card...');
  try {
    resolvedBusinessName =
      (typeof cardData?.businessName === 'string' && cardData.businessName.trim())
        ? cardData.businessName.trim()
        : 'My Business';

    // Infer businessType from rawText if missing
    const rawType =
      typeof cardData?.businessType === 'string' && cardData.businessType.trim()
        ? cardData.businessType.trim()
        : null;
    resolvedBusinessType = rawType ?? inferBusinessType(cardData?.rawText ?? '', resolvedBusinessName);
  } catch (stepErr) {
    console.warn('[businessCardToStore] Step 1 failed:', stepErr?.message ?? stepErr);
    // Keep defaults — non-fatal
  }

  // ── STEP 2 — Enrich profile ────────────────────────────────────────────────
  await emitLine(emitContextUpdate, '🔍 Enriching business profile...');
  try {
    // Scrape website if available
    if (typeof cardData?.website === 'string' && cardData.website.trim()) {
      try {
        const { scrapeStoreImages } = await import('../../services/draftStore/storeImageScraper.ts');
        const scrapeResult = await scrapeStoreImages({
          businessName: resolvedBusinessName,
          websiteUrl: cardData.website.trim(),
        });
        scrapedData = scrapeResult ?? null;
      } catch (scrapeErr) {
        console.warn('[businessCardToStore] Step 2 scrape failed:', scrapeErr?.message ?? scrapeErr);
      }
    }

    // Generate business profile from card data
    try {
      const { loadBusinessProfileService } = await import('../../services/draftStore/loadBusinessProfileService.js');
      const profileMod = await loadBusinessProfileService();
      const generateProfile = profileMod?.generateBusinessProfile ?? profileMod?.default?.generateBusinessProfile;
      if (typeof generateProfile === 'function') {
        enrichedProfile = await generateProfile({
          mode: 'ai_description',
          descriptionText: [
            resolvedBusinessName,
            resolvedBusinessType,
            cardData?.tagline ?? '',
            cardData?.address ?? '',
          ].filter(Boolean).join('. '),
          explicitName: resolvedBusinessName,
          explicitType: resolvedBusinessType,
          regionCode: 'en',
        });
      }
    } catch (profileErr) {
      console.warn('[businessCardToStore] Step 2 profile gen failed:', profileErr?.message ?? profileErr);
    }
  } catch (stepErr) {
    console.warn('[businessCardToStore] Step 2 failed:', stepErr?.message ?? stepErr);
  }

  // ── STEP 3 — Resolve vertical ──────────────────────────────────────────────
  await emitLine(emitContextUpdate, '🗂 Resolving business vertical...');
  try {
    const r = resolveVertical({
      businessType: resolvedBusinessType,
      businessName: resolvedBusinessName,
      userNotes: cardData?.rawText ?? '',
      explicitVertical: null,
    });
    verticalSlug = r.slug ?? 'services.generic';
    verticalGroup = r.group ?? 'services';
    audience = resolveAudience({
      businessType: resolvedBusinessType,
      businessName: resolvedBusinessName,
    });
  } catch (stepErr) {
    console.warn('[businessCardToStore] Step 3 failed:', stepErr?.message ?? stepErr);
  }

  // ── STEP 4 — Content resolution ────────────────────────────────────────────
  await emitLine(emitContextUpdate, '✍️ Generating store content...');
  try {
    const contentOpts = { emitContextUpdate };
    const contentBase = {
      businessName: resolvedBusinessName,
      businessType: resolvedBusinessType,
      verticalSlug,
      tenantKey: tenantId ?? 'smart-store-card',
    };

    [sloganResult, heroTextResult, taglineResult] = await Promise.all([
      resolveContent(missionId, {
        ...contentBase,
        type: 'slogan',
        existingContent: cardData?.tagline,
      }, contentOpts),
      resolveContent(missionId, {
        ...contentBase,
        type: 'hero_text',
      }, contentOpts),
      resolveContent(missionId, {
        ...contentBase,
        type: 'slogan',
        existingContent: cardData?.tagline,
      }, contentOpts),
    ]);
  } catch (stepErr) {
    console.warn('[businessCardToStore] Step 4 failed:', stepErr?.message ?? stepErr);
  }

  // ── STEP 5 — Build catalog ─────────────────────────────────────────────────
  await emitLine(emitContextUpdate, '📦 Building product catalog...');
  try {
    const { buildCatalog } = await import('../../services/draftStore/buildCatalog.js');
    // Use a temp draftId for item ID generation; will be replaced by the real draft
    const tempDraftId = `card_${Date.now()}`;
    catalog = await buildCatalog({
      mode: 'ai',
      draftId: tempDraftId,
      businessName: resolvedBusinessName,
      businessType: resolvedBusinessType,
      verticalSlug,
      audience,
      // itemTarget: 20 — card-based stores start smaller (honoured by callers that read it)
      itemTarget: 20,
      generationProfile: {
        verticalSlug,
        verticalGroup,
        audience,
        keywords: [],
      },
    });
  } catch (stepErr) {
    console.warn('[businessCardToStore] Step 5 failed:', stepErr?.message ?? stepErr);
    // Continue — generateDraft will build its own catalog
  }

  // ── STEP 6 — Assemble draft ────────────────────────────────────────────────
  await emitLine(emitContextUpdate, '🏗 Assembling store draft...');
  try {
    const { createDraftStoreForUser, generateDraft } = await import(
      '../../services/draftStore/draftStoreService.js'
    );

    const draft = await createDraftStoreForUser(prisma, {
      userId,
      tenantKey: tenantId ?? 'smart-store-card',
      input: {
        businessName: resolvedBusinessName,
        businessType: resolvedBusinessType,
        verticalSlug,
        tenantId,
        mode: 'ai',
        // Card contact data
        phone: cardData?.phone ?? null,
        email: cardData?.email ?? null,
        website: cardData?.website ?? null,
        address: cardData?.address ?? null,
        // Source metadata
        source: 'business_card',
      },
      mode: 'ai',
      status: 'draft',
    });

    draftId = draft.id;

    await generateDraft(draftId, {
      emitContextUpdate,
      reactMissionId: missionId,
      userId,
      // Pass enriched context through options (non-breaking additions)
      businessName: resolvedBusinessName,
      businessType: resolvedBusinessType,
      verticalSlug,
      // Pre-built catalog and content — picked up by future resolvers
      catalog,
      contentOverrides: {
        slogan: sloganResult.content,
        heroText: heroTextResult.content,
        tagline: taglineResult.content,
      },
    });
  } catch (stepErr) {
    console.error('[businessCardToStore] Step 6 failed:', stepErr?.message ?? stepErr);
    emitHealthProbe('smart_store_from_card', {
      missionId: missionId ?? undefined,
      cardExtracted: true,
      websiteEnriched: Boolean(scrapedData),
      itemCount: Array.isArray(catalog?.products) ? catalog.products.length : 0,
      draftId: draftId ?? null,
      ok: false,
    });
    return { error: stepErr?.message ?? String(stepErr), partial: true };
  }

  // ── STEP 7 — Write to context ──────────────────────────────────────────────
  await emitLine(emitContextUpdate, '✅ Smart store ready');

  const itemCount = Array.isArray(catalog?.products) ? catalog.products.length : 0;

  const smartStoreSource = {
    cardExtracted: true,
    websiteEnriched: Boolean(scrapedData),
    verticalSlug,
    itemCount,
    contentSources: {
      slogan: sloganResult.source,
      heroText: heroTextResult.source,
      tagline: taglineResult.source,
    },
  };

  try {
    if (typeof emitContextUpdate === 'function') {
      await emitContextUpdate({ smart_store_source: smartStoreSource }).catch(() => {});
    } else if (missionId) {
      const { mergeMissionContext } = await import('../mission.js');
      await mergeMissionContext(missionId, { smart_store_source: smartStoreSource }, { prisma }).catch(() => {});
    }
  } catch {
    /* non-fatal */
  }

  // ── Telemetry probe ────────────────────────────────────────────────────────
  emitHealthProbe('smart_store_from_card', {
    missionId: missionId ?? undefined,
    cardExtracted: true,
    websiteEnriched: Boolean(scrapedData),
    itemCount,
    draftId: draftId ?? null,
    ok: true,
  });

  return {
    draftId,
    storeId: null, // populated after commit
    summary: {
      businessName: resolvedBusinessName,
      businessType: resolvedBusinessType,
      verticalSlug,
      itemCount,
      websiteEnriched: Boolean(scrapedData),
    },
  };
}
