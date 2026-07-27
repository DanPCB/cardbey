/**
 * Canonical business slug for publish/republish (V1).
 * Auto-managed slugs refresh when the store name changes; manual slugs are preserved in stylePreferences.
 */

import { slugify, generateUniqueStoreSlugForTx } from '../../utils/slug.js';

function parseStylePreferences(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function readSlugPublishMeta(stylePreferences) {
  const prefs = parseStylePreferences(stylePreferences);
  const nested =
    prefs.metadataJson && typeof prefs.metadataJson === 'object' && !Array.isArray(prefs.metadataJson)
      ? prefs.metadataJson
      : {};
  const slugLocked = prefs.slugLocked === true || nested.slugLocked === true;
  const slugSource =
    prefs.slugSource === 'manual' || nested.slugSource === 'manual'
      ? 'manual'
      : prefs.slugSource === 'auto' || nested.slugSource === 'auto'
        ? 'auto'
        : slugLocked
          ? 'manual'
          : 'auto';
  return { slugLocked, slugSource };
}

export function mergeSlugPublishMeta(stylePreferences, { slugSource, slugLocked }) {
  const prefs = parseStylePreferences(stylePreferences);
  return {
    ...prefs,
    slugSource,
    slugLocked: slugLocked === true,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} prismaOrTx
 * @param {{
 *   businessId: string;
 *   currentName: string;
 *   existingSlug?: string | null;
 *   stylePreferences?: unknown;
 * }} input
 * @returns {Promise<{ slug: string; updated: boolean; slugSource: 'auto' | 'manual' }>}
 */
export async function resolveCanonicalBusinessSlug(prismaOrTx, input) {
  const businessId = String(input.businessId ?? '').trim();
  const currentName = String(input.currentName ?? '').trim() || 'My Store';
  const normalizedExisting = String(input.existingSlug ?? '').toLowerCase().trim();
  const { slugLocked, slugSource } = readSlugPublishMeta(input.stylePreferences);

  if ((slugLocked || slugSource === 'manual') && normalizedExisting) {
    return { slug: normalizedExisting, updated: false, slugSource: 'manual' };
  }

  const desired = slugify(currentName) || 'store';
  if (normalizedExisting && normalizedExisting === desired) {
    return { slug: normalizedExisting, updated: false, slugSource: 'auto' };
  }

  const slug = await generateUniqueStoreSlugForTx(prismaOrTx, currentName, businessId || null);
  return {
    slug,
    updated: slug !== normalizedExisting,
    slugSource: 'auto',
  };
}

/**
 * Persist canonical slug + store name on Business before returning publish URLs.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function applyCanonicalSlugOnPublish(prisma, { businessId, storeName }) {
  const id = String(businessId ?? '').trim();
  if (!id) return null;

  const business = await prisma.business.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, stylePreferences: true },
  });
  if (!business) return null;

  const trimmedName = String(storeName ?? '').trim() || business.name || 'My Store';
  const resolved = await resolveCanonicalBusinessSlug(prisma, {
    businessId: id,
    currentName: trimmedName,
    existingSlug: business.slug,
    stylePreferences: business.stylePreferences,
  });

  const stylePreferences = mergeSlugPublishMeta(business.stylePreferences, {
    slugSource: resolved.slugSource,
    slugLocked: resolved.slugSource === 'manual',
  });

  const data = {
    name: trimmedName,
    stylePreferences,
    updatedAt: new Date(),
  };
  if (resolved.updated || resolved.slug !== business.slug) {
    data.slug = resolved.slug;
  }

  if (resolved.updated || trimmedName !== business.name || data.slug) {
    await prisma.business.update({ where: { id }, data });
    if (process.env.NODE_ENV !== 'test') {
      console.log('[publishDraft] canonical slug applied', {
        businessId: id,
        previousSlug: business.slug,
        slug: resolved.slug,
        slugSource: resolved.slugSource,
        storeName: trimmedName,
        updated: resolved.updated,
      });
    }
  }

  return { slug: resolved.slug, slugSource: resolved.slugSource, updated: resolved.updated };
}

export function storeNameFromDraftPreview(rawPreview) {
  const preview =
    rawPreview && typeof rawPreview === 'object' && !Array.isArray(rawPreview) ? rawPreview : {};
  const meta = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  return (
    (typeof meta.storeName === 'string' && meta.storeName.trim()) ||
    (typeof preview.storeName === 'string' && preview.storeName.trim()) ||
    'My Store'
  );
}
