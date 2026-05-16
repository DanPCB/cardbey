/**
 * Apply a store content patch to a DraftStore record.
 * Called from performerProactiveStepRoutes.js confirm handler when
 * isStoreContentFix is true (patch.filePath starts with "store:").
 *
 * No filesystem writes — all changes go to the DB via Prisma.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { parseStoreContentPatchV1 } from './storeContentPatchContract.js';

const HERO_FIELD_PATTERNS = [
  'headline', 'title', 'hero', 'heading', 'h1', 'h2', 'tagline', 'subheadline',
];

/**
 * Resolve the field name from the store: sentinel path.
 * e.g. "store:heroTitle" → "heroTitle"
 *      "store:heroSubtitle" → "heroSubtitle"
 *      "store:bannerText" → "bannerText"
 * @param {string} filePath
 * @returns {string}
 */
function fieldFromSentinel(filePath) {
  const after = String(filePath || '').replace(/^store:/, '').trim();
  return after || 'heroTitle';
}

/**
 * `WebsitePreviewPage` renders the hero H1 as `section.content.headline || preview.storeName`.
 * If the generator set `headline`, updating only `storeName` / `heroTitle` leaves the old title visible.
 *
 * @param {Record<string, unknown>} preview
 * @param {{ headline?: string, subheadline?: string }} fields
 * @returns {Record<string, unknown>}
 */
export function syncMiniWebsiteHeroSectionInPreview(preview, { headline, subheadline }) {
  const h = headline != null ? String(headline).trim() : '';
  const s = subheadline != null ? String(subheadline).trim() : '';
  if (!h && !s) return preview;

  const w = preview.website;
  if (!w || typeof w !== 'object' || Array.isArray(w)) return preview;
  const sections = Array.isArray(w.sections) ? w.sections : null;
  if (!sections || sections.length === 0) return preview;

  let any = false;
  const nextSections = sections.map((sec) => {
    if (!sec || typeof sec !== 'object' || Array.isArray(sec) || sec.type !== 'hero') return sec;
    const rawC = sec.content;
    const c =
      rawC && typeof rawC === 'object' && !Array.isArray(rawC)
        ? { ...rawC }
        : {};
    let touched = false;
    if (h) {
      c.headline = h;
      touched = true;
    }
    if (s) {
      c.subheadline = s;
      touched = true;
    }
    if (!touched) return sec;
    any = true;
    return { ...sec, content: c };
  });

  if (!any) return preview;
  return {
    ...preview,
    website: {
      ...w,
      sections: nextSections,
    },
  };
}

/**
 * Apply a content patch to a store's draft preview.
 *
 * Lookup order for the draft:
 *   1. ownerUserId === userId           (user's active draft — primary)
 *   2. committedStoreId === storeId      (fallback when linked to a store)
 *
 * Store content fixes always apply patch.newStr only; patch.oldStr is ignored (LLM-derived old text is unreliable).
 *
 * @param {{
 *   storeId: string,
 *   userId: string,
 *   patch: { filePath: string, oldStr: string, newStr: string },
 *   description: string,
 *   storeContentPatch?: unknown,
 *   preferredDraftId?: string | null,
 * }} params
 * @returns {Promise<Record<string, unknown>>}
 */
export async function applyStoreContentPatch({
  storeId,
  userId,
  patch,
  description,
  storeContentPatch,
  preferredDraftId,
}) {
  if (!userId) throw new Error('userId required for store content patch');

  const prisma = getPrismaClient();
  const canonical = parseStoreContentPatchV1(storeContentPatch);
  const field = canonical.valid ? canonical.patch.targetField : fieldFromSentinel(patch.filePath);
  const newValue = canonical.valid
    ? canonical.patch.newText.trim()
    : String(patch.newStr ?? '').trim();
  const descLower = String(description ?? '').toLowerCase();

  // Determine if this is a hero text field
  const isHeroField = HERO_FIELD_PATTERNS.some((kw) => descLower.includes(kw)) ||
    field === 'heroTitle' || field === 'heroSubtitle';

  const pref = typeof preferredDraftId === 'string' ? preferredDraftId.trim() : '';
  const storeIdTrim = typeof storeId === 'string' ? storeId.trim() : '';

  // ── Find the most relevant draft ─────────────────────────────────────────
  /** Prefer the draft the UI iframe is showing (pipeline metadata), not "latest by updatedAt". */
  let draft = null;
  if (pref) {
    const orAccess = [{ ownerUserId: userId }];
    if (storeIdTrim) orAccess.push({ committedStoreId: storeIdTrim });
    draft = await prisma.draftStore
      .findFirst({
        where: {
          id: pref,
          status: { not: 'archived' },
          OR: orAccess,
        },
        select: { id: true, preview: true },
      })
      .catch(() => null);
  }

  if (!draft && userId) {
    draft = await prisma.draftStore
      .findFirst({
        where: {
          ownerUserId: userId,
          status: { not: 'archived' },
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, preview: true },
      })
      .catch(() => null);
  }

  if (!draft && storeIdTrim) {
    draft = await prisma.draftStore
      .findFirst({
        where: {
          committedStoreId: storeIdTrim,
          status: { not: 'archived' },
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, preview: true },
      })
      .catch(() => null);
  }

  if (!draft) {
    return {
      field,
      oldValue: '',
      newValue,
      note: 'No active draft found for this user — patch logged but not persisted',
      appliedAt: new Date().toISOString(),
      ...(canonical.valid ? { storeContentPatch: canonical.patch } : {}),
    };
  }

  // ── Apply the field update to preview JSON ────────────────────────────────
  const preview =
    draft.preview && typeof draft.preview === 'object' && !Array.isArray(draft.preview)
      ? draft.preview
      : {};

  /** Previous DB value for the target field (for response only). */
  const previousFieldValue = (() => {
    if (field === 'heroSubtitle') {
      return String(preview.heroSubtitle ?? preview.tagline ?? '').trim();
    }
    if (field === 'bannerText') {
      return String(preview.bannerText ?? '').trim();
    }
    if (field === 'storeName' || field === 'name') {
      return String(
        preview.storeName ?? preview.name ?? (preview.meta && typeof preview.meta === 'object' ? preview.meta.storeName : '') ?? '',
      ).trim();
    }
    if (field === 'heroTitle' || isHeroField) {
      return String(preview.heroTitle ?? '').trim();
    }
    return String(preview[field] ?? '').trim();
  })();

  // Plain text value (strip any HTML tags the LLM may have added)
  const plainText = newValue.replace(/<[^>]+>/g, '').trim();

  let updatedPreview;

  if (isHeroField) {
    if (field === 'heroSubtitle') {
      updatedPreview = syncMiniWebsiteHeroSectionInPreview(
        { ...preview, heroSubtitle: plainText, tagline: plainText },
        { subheadline: plainText },
      );
    } else {
      // Hero title: preview iframe reads store display name from `preview.storeName` (see draftStore / stores routes).
      const prevHero = String(preview.heroTitle ?? '').trim();
      const prevStore = String(preview.storeName ?? '').trim();
      const storeTrackedHero = Boolean(prevStore && prevHero && prevStore === prevHero);
      const userAskedStoreOrSiteName =
        /\b(website|store|business)\s+name\b/i.test(descLower) ||
        /\bsite\s+name\b/i.test(descLower);
      const syncStoreName = userAskedStoreOrSiteName || storeTrackedHero;
      const meta =
        preview.meta && typeof preview.meta === 'object' && !Array.isArray(preview.meta)
          ? preview.meta
          : null;
      const nextMeta =
        syncStoreName && meta
          ? { ...meta, storeName: plainText }
          : meta;
      updatedPreview = syncMiniWebsiteHeroSectionInPreview(
        {
          ...preview,
          heroTitle: plainText,
          ...(syncStoreName
            ? {
                storeName: plainText,
                ...(nextMeta && nextMeta !== meta ? { meta: nextMeta } : {}),
              }
            : {}),
        },
        { headline: plainText },
      );
    }
  } else if (field === 'bannerText') {
    updatedPreview = { ...preview, bannerText: plainText };
  } else if (field === 'storeName' || field === 'name') {
    const meta =
      preview.meta && typeof preview.meta === 'object' && !Array.isArray(preview.meta)
        ? { ...preview.meta, storeName: plainText }
        : preview.meta;
    updatedPreview = syncMiniWebsiteHeroSectionInPreview(
      {
        ...preview,
        storeName: plainText,
        ...(field === 'name' ? { name: plainText } : {}),
        ...(meta && meta !== preview.meta ? { meta } : {}),
      },
      { headline: plainText },
    );
  } else {
    // Generic field update — write directly into preview under the field name
    updatedPreview = { ...preview, [field]: plainText };
  }

  await prisma.draftStore.update({
    where: { id: draft.id },
    data: {
      preview: updatedPreview,
      updatedAt: new Date(),
    },
  });

  return {
    field,
    oldValue: previousFieldValue,
    newValue: plainText,
    draftId: draft.id,
    appliedAt: new Date().toISOString(),
    ...(canonical.valid ? { storeContentPatch: canonical.patch } : {}),
  };
}