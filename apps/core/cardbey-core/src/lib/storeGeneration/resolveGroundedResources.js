/**
 * Phase 3 resource resolver — satisfies GroundedComposition.resourceNeeds only.
 * Never re-infers archetype / offerings / business identity.
 */

import { Features } from '../../config/features.js';
import {
  createEmptyGroundedResourceBundle,
  flattenResourceNeeds,
  preferCandidateBySourcePriority,
  isAssetSuitableForNeed,
} from './groundedResourceBundle.js';

/**
 * @returns {boolean}
 */
export function isResourceGroundedStoreGenerationEnabled() {
  return (
    Features.groundedStoreCreation?.v1 === true &&
    Features.resourceGroundedStoreGeneration?.v1 === true
  );
}

/**
 * Collect owner-provided media candidates from draft input / preview (no search).
 * @param {Record<string, any>} ctx
 */
export function collectOwnerProvidedCandidates(ctx = {}) {
  const out = [];
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const preview = ctx.preview && typeof ctx.preview === 'object' ? ctx.preview : {};

  const push = (url, meta) => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u || u.length < 8) return;
    out.push({
      url: u,
      resourceRef: meta.resourceRef || null,
      sourceTier: 'owner_provided',
      confidence: meta.confidence ?? 0.95,
      rights: { status: 'owner', decision: 'allow' },
      provenance: { ...meta, tier: 'owner_provided' },
      isDocumentScan: Boolean(meta.isDocumentScan),
      isLogo: Boolean(meta.isLogo),
    });
  };

  // Explicit owner media (not OCR card scan as hero)
  if (input.logoUrl || input.logo) {
    push(input.logoUrl || input.logo, { isLogo: true, purposeHints: ['brand', 'logo'] });
  }
  if (Array.isArray(input.ownerMediaUrls)) {
    for (const u of input.ownerMediaUrls) push(u, { purposeHints: ['gallery', 'product', 'service'] });
  }
  if (Array.isArray(input.productImages)) {
    for (const u of input.productImages) push(u, { purposeHints: ['product'] });
  }
  // Existing preview item images already on draft
  if (Array.isArray(preview.items)) {
    for (const it of preview.items) {
      if (it?.imageUrl && it.imageSource === 'owner') {
        push(it.imageUrl, { purposeHints: ['product', 'service'], resourceRef: it.id });
      }
    }
  }
  // Imported hero — only if marked imported/owner (not OCR card)
  if (
    preview.heroImageUrl &&
    (preview.meta?.heroImageSource === 'imported' || preview.meta?.heroImageSource === 'owner')
  ) {
    push(preview.heroImageUrl, { purposeHints: ['hero'], isDocumentScan: false });
  }
  // Card/OCR scan retained as document evidence — never hero
  if (input.imageDataUrl || input.photoDataUrl || input.cardImageDataUrl) {
    push(input.imageDataUrl || input.photoDataUrl || input.cardImageDataUrl, {
      isDocumentScan: true,
      purposeHints: ['document', 'ocr'],
      confidence: 0.99,
    });
  }
  return out;
}

/**
 * Build a URI/Library search utterance from a need without inventing business type.
 * @param {{ purpose?: string, subjectHints?: string[], toneHints?: string[], negativeHints?: string[] }} need
 * @param {{ archetype?: string|null, businessName?: string|null }} ctx
 */
export function buildNeedSearchUtterance(need, ctx = {}) {
  const parts = [
    need?.purpose,
    ...(need?.subjectHints || []),
    ...(need?.toneHints || []),
    ctx.archetype ? `for ${ctx.archetype}` : null,
    // businessName only as weak context — not a category invent
    ctx.businessName ? `business ${ctx.businessName}` : null,
  ].filter(Boolean);
  const negatives = (need?.negativeHints || []).filter(Boolean);
  let utterance = parts.join(' ').trim() || 'business photography';
  if (negatives.length) {
    utterance += ` avoid ${negatives.join(' ')}`;
  }
  return utterance;
}

/**
 * Map a URI candidate into our selection shape (rights fail-closed).
 * @param {any} candidate
 */
export function mapUriCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const resource = candidate.resource || candidate;
  const rights = candidate.rights || resource.rightsSnapshot || null;
  const decision = String(rights?.decision || rights?.status || '').toLowerCase();
  if (decision && /deny|reject|forbidden|unsafe|unknown/.test(decision)) {
    return null;
  }
  const custody = String(
    candidate.explanation?.custodyMode || resource.technical?.custodyMode || '',
  ).toUpperCase();
  // REFERENCE_ONLY is usable for draft preview but flagged
  const url =
    resource.previewUrl ||
    resource.url ||
    resource.sourceMetadata?.previewUrl ||
    resource.technical?.previewUrl ||
    null;
  if (!url) return null;
  return {
    url: String(url),
    resourceRef: resource.id || candidate.id || null,
    sourceTier: resource.sourceId?.includes('library') || resource.sourceId === 'src_cardbey'
      ? 'universal_library'
      : 'uri_external',
    confidence: typeof candidate.score === 'number' ? candidate.score : 0.55,
    rights: rights || { status: 'unknown', custodyMode: custody || null },
    provenance: {
      sourceId: resource.sourceId || null,
      custodyMode: custody || null,
      provider: resource.provider || null,
    },
    isDocumentScan: false,
    isLogo: false,
  };
}

/**
 * Resolve resourceNeeds → GroundedResourceBundle.
 * @param {{
 *   resourceNeeds: Record<string, any>,
 *   composition?: Record<string, any>,
 *   input?: Record<string, any>,
 *   preview?: Record<string, any>,
 *   prisma?: any,
 *   searchFn?: Function,
 *   minScore?: number,
 * }} opts
 */
export async function resolveResourceNeedsToBundle(opts = {}) {
  const resourceNeeds = opts.resourceNeeds || opts.composition?.resourceNeeds || {};
  const composition = opts.composition || {};
  const archetype = composition.archetype || null;
  const slots = flattenResourceNeeds(resourceNeeds);
  const bundle = createEmptyGroundedResourceBundle({
    compositionId: composition.compositionId || composition.archetype || null,
    archetype,
  });
  const ownerCandidates = collectOwnerProvidedCandidates(opts);
  const minScore =
    opts.minScore ??
    (Number.isFinite(Features.groundedStoreCreation?.minMediaMatchScore)
      ? Features.groundedStoreCreation.minMediaMatchScore
      : 0.55);

  const searchFn =
    opts.searchFn ||
    (async (prisma, input) => {
      try {
        const { searchResourcesForConsumer } = await import(
          '../../services/universalResourceIntelligence/consumers.js'
        );
        return searchResourcesForConsumer(prisma, input);
      } catch (e) {
        return { ok: false, error: e?.message || 'uri_unavailable', candidates: [] };
      }
    });

  for (const slot of slots) {
    const rejectedReasons = [];
    /** @type {any[]} */
    const pool = [];

    for (const c of ownerCandidates) {
      if (!isAssetSuitableForNeed(slot.need, c)) {
        rejectedReasons.push('owner_asset_unsuitable_for_need');
        continue;
      }
      // purpose hint soft match
      const hints = c.provenance?.purposeHints || [];
      if (
        Array.isArray(hints) &&
        hints.length &&
        !hints.some((h) => String(h).includes(slot.purpose) || slot.purpose.includes(String(h)))
      ) {
        // still allow owner non-document assets for gallery/product with weak match
        if (c.isDocumentScan) continue;
      }
      pool.push(c);
    }

    // First-party / URI only when owner did not fill
    let uriAttempted = false;
    if (pool.filter((p) => p.sourceTier === 'owner_provided' && !p.isDocumentScan).length === 0) {
      uriAttempted = true;
      if (opts.prisma || opts.searchFn) {
        const utterance = buildNeedSearchUtterance(slot.need, {
          archetype,
          businessName: opts.input?.businessName || opts.preview?.storeName,
        });
        const result = await searchFn(opts.prisma, {
          utterance,
          industry: archetype || opts.input?.category || null,
          mediaType: 'image',
          purpose: 'storefront_media',
          consumer: 'store_generation_phase3',
          need: slot.need,
        });
        const candidates = result?.candidates || result?.results || result?.kit?.slots || [];
        const list = Array.isArray(candidates) ? candidates : [];
        for (const raw of list) {
          const mapped = mapUriCandidate(raw);
          if (!mapped) {
            rejectedReasons.push('rights_or_mapping_rejected');
            continue;
          }
          if ((mapped.confidence || 0) < minScore) {
            rejectedReasons.push('below_min_media_match_score');
            continue;
          }
          // Negative hint soft reject
          const neg = slot.need?.negativeHints || [];
          const blob = JSON.stringify(mapped.provenance || {}).toLowerCase();
          if (neg.some((n) => blob.includes(String(n).toLowerCase()))) {
            rejectedReasons.push('negative_hint_match');
            continue;
          }
          pool.push(mapped);
        }
        if (!result?.ok && result?.error) {
          rejectedReasons.push(String(result.error));
        }
      } else {
        rejectedReasons.push('uri_search_unavailable');
      }
    }

    let selected = null;
    for (const c of pool) {
      if (c.isDocumentScan) continue; // never select card scan for visual slots
      selected = selected ? preferCandidateBySourcePriority(selected, c) : c;
    }

    if (!selected) {
      bundle.resources.push({
        needId: slot.needId,
        purpose: slot.purpose,
        status: 'needs_media',
        resourceRef: null,
        url: null,
        sourceTier: 'unresolved',
        provenance: { uriAttempted },
        rights: null,
        confidence: null,
        rejectedReasons: [...new Set(rejectedReasons)],
      });
      bundle.unresolvedNeeds.push(slot.needId);
      continue;
    }

    bundle.resources.push({
      needId: slot.needId,
      purpose: slot.purpose,
      status: 'filled',
      resourceRef: selected.resourceRef,
      url: selected.url,
      sourceTier: selected.sourceTier,
      provenance: selected.provenance || {},
      rights: selected.rights || null,
      confidence: selected.confidence ?? null,
      rejectedReasons: [],
    });
  }

  bundle.diagnostics = {
    slotCount: slots.length,
    filled: bundle.resources.filter((r) => r.status === 'filled').length,
    needsMedia: bundle.unresolvedNeeds.length,
    ownerCandidateCount: ownerCandidates.length,
  };
  return bundle;
}

/**
 * Attach GroundedResourceBundle into draft preview fields (assembly only).
 * Does not invent catalog or change archetype.
 * @param {object} preview
 * @param {import('./groundedResourceBundle.js').GroundedResourceBundle} bundle
 */
export function attachGroundedResourceBundleToPreview(preview, bundle) {
  if (!preview || !bundle) return preview;
  const hero = bundle.resources.find((r) => r.needId === 'hero' && r.status === 'filled' && r.url);
  if (hero?.url && !preview.heroImageUrl) {
    preview.heroImageUrl = hero.url;
    preview.meta = {
      ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
      heroImageSource: hero.sourceTier === 'owner_provided' ? 'owner' : 'grounded_resource',
      groundedResourceHero: true,
    };
  }
  const productOrService = bundle.resources.filter(
    (r) =>
      r.status === 'filled' &&
      r.url &&
      (r.purpose === 'product' || r.purpose === 'service' || r.needId.startsWith('product') || r.needId.startsWith('service')),
  );
  if (Array.isArray(preview.items) && productOrService.length) {
    let pi = 0;
    preview.items = preview.items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      if (it.imageUrl) return it;
      const slot = productOrService[pi++];
      if (!slot) return it;
      return {
        ...it,
        imageUrl: slot.url,
        imageSource: slot.sourceTier,
        imageConfidence: slot.confidence,
      };
    });
  }
  preview.meta = {
    ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
    groundedResourceBundle: {
      schema: bundle.schema,
      version: bundle.version,
      archetype: bundle.archetype,
      filled: bundle.diagnostics?.filled ?? null,
      unresolvedNeeds: bundle.unresolvedNeeds,
      resources: bundle.resources.map((r) => ({
        needId: r.needId,
        purpose: r.purpose,
        status: r.status,
        sourceTier: r.sourceTier,
        resourceRef: r.resourceRef,
        // omit url binary verbosity in meta summary — keep presence flag
        hasUrl: Boolean(r.url),
        rights: r.rights,
      })),
    },
  };
  return preview;
}

export default {
  isResourceGroundedStoreGenerationEnabled,
  collectOwnerProvidedCandidates,
  buildNeedSearchUtterance,
  mapUriCandidate,
  resolveResourceNeedsToBundle,
  attachGroundedResourceBundleToPreview,
};
