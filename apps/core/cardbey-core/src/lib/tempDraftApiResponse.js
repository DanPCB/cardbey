/**
 * Shared GET temp draft by generationRunId response builder.
 * Used by /api/stores/temp/draft and /api/public/store/temp/draft.
 */

import { getDraftByGenerationRunId } from '../services/draftStore/draftStoreService.js';
import { resolveDraftBusinessName, resolveDraftBusinessType, resolveDraftLocation } from '../services/draftStore/draftStoreService.js';
import { resolveCanonicalHeroApiFields } from '../services/draftStore/draftPreviewHeroSync.js';
import { CATALOG_ITEM_LIMIT } from '../config/catalogLimits.js';

function parseJsonField(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

function mapPreviewItems(preview, limit = CATALOG_ITEM_LIMIT) {
  const raw = Array.isArray(preview.items)
    ? preview.items
    : Array.isArray(preview.products)
      ? preview.products
      : [];
  return raw.slice(0, limit).map((item) => ({
    id: item?.id ?? null,
    name: item?.name ?? '',
    price: item?.price ?? null,
    description: item?.description ?? null,
    image: item?.imageUrl ?? item?.image ?? null,
    category: item?.categoryId ?? item?.category ?? null,
  }));
}

function heroImageFromPreview(preview) {
  return resolveCanonicalHeroApiFields(preview).heroImageUrl;
}

function avatarImageFromPreview(preview) {
  if (preview?.avatar?.imageUrl && String(preview.avatar.imageUrl).trim()) return String(preview.avatar.imageUrl).trim();
  if (typeof preview?.avatarImageUrl === 'string' && preview.avatarImageUrl.trim()) return preview.avatarImageUrl.trim();
  if (preview?.avatar?.url && String(preview.avatar.url).trim()) return String(preview.avatar.url).trim();
  return null;
}

/**
 * Build HTTP status + JSON body for temp draft lookup by generationRunId.
 * @param {string} generationRunId
 * @param {{ userId?: string|null }} [options]
 * @returns {Promise<{ httpStatus: number, body: Record<string, unknown> }>}
 */
export async function buildTempDraftByGenerationRunIdResponse(generationRunId, options = {}) {
  const runId = String(generationRunId ?? '').trim();
  const userId = options.userId ?? null;

  const draft = await getDraftByGenerationRunId(runId).catch(() => null);
  const preview = draft ? parseJsonField(draft.preview) : {};
  const input = draft ? parseJsonField(draft.input) : {};
  const businessName = resolveDraftBusinessName(draft, preview, input);
  const businessType = resolveDraftBusinessType(draft, preview, input);
  const location = resolveDraftLocation(draft, preview, input);

  const storeBase = {
    id: 'temp',
    ...(businessName ? { name: businessName } : {}),
    type: businessType || 'General',
    ...(location ? { location } : {}),
    ...(userId ? { userId } : {}),
  };

  const categories = Array.isArray(preview.categories) ? preview.categories : [];
  const products = (Array.isArray(preview.items) ? preview.items : Array.isArray(preview.products) ? preview.products : []).map(
    (item) => ({ ...item, description: item?.description ?? null }),
  );

  if (!draft) {
    return {
      httpStatus: 202,
      body: {
        ok: true,
        status: 'generating',
        message: 'Draft is still being generated',
        generationRunId: runId,
        storeId: 'temp',
        draft: null,
        draftId: null,
        store: storeBase,
        products: [],
        categories: [],
        qaReport: null,
      },
    };
  }

  const rawStatus = String(draft.status ?? '').toLowerCase();
  if (rawStatus === 'generating' || rawStatus === 'pending') {
    return {
      httpStatus: 202,
      body: {
        ok: true,
        status: 'generating',
        message: 'Draft is still being generated',
        generationRunId: runId,
        storeId: 'temp',
        draft: null,
        draftId: null,
        store: storeBase,
        products: [],
        categories: [],
        qaReport: preview?.meta?.qaReport ?? null,
      },
    };
  }

  if (rawStatus === 'failed' || rawStatus === 'error') {
    return {
      httpStatus: 200,
      body: {
        ok: false,
        status: 'failed',
        message: draft.error || 'Draft generation failed',
        generationRunId: runId,
        storeId: 'temp',
        draft: null,
        draftId: null,
        store: storeBase,
        products: [],
        categories: [],
        error: draft.error ?? null,
        errorCode: draft.errorCode ?? null,
        recommendedAction: draft.recommendedAction ?? null,
        qaReport: null,
      },
    };
  }

  const items = mapPreviewItems(preview);
  const miniWebsiteSections = preview?.website?.sections ?? null;
  const canonicalHero = resolveCanonicalHeroApiFields(preview);
  const heroImage = canonicalHero.heroImageUrl;
  const heroVideo = canonicalHero.heroVideo;
  const avatarImage = avatarImageFromPreview(preview);

  const previewDraft = {
    id: draft.id,
    businessName,
    businessType: businessType || 'general',
    location: location || '',
    heroImage,
    heroVideo,
    heroMediaType: canonicalHero.heroMediaType,
    avatarImage,
    slug: preview?.meta?.slug ?? input?.slug ?? null,
    items,
    status: 'ready',
    miniWebsiteSections,
  };

  return {
    httpStatus: 200,
    body: {
      ok: true,
      status: 'ready',
      generationRunId: input.generationRunId || draft.generationRunId || runId,
      storeId: 'temp',
      draftId: String(draft.id),
      draft: previewDraft,
      store: {
        ...storeBase,
        ...(businessName ? { name: businessName } : {}),
      },
      products,
      categories,
      heroImageUrl: heroImage,
      heroVideo: heroVideo ?? undefined,
      heroMediaType: canonicalHero.heroMediaType ?? undefined,
      qaReport: preview?.meta?.qaReport ?? null,
    },
  };
}
