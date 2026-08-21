/**
 * Canonical store Shows / Featured Content — Business.storefrontSettings.featuredWorks
 * (+ mirrored miniWebsite show section). No new Prisma model.
 */

import { randomUUID } from 'node:crypto';
import { getMiniWebsiteSnapshot } from '../../lib/miniWebsiteSectionMerge.js';

export const SHOW_STATUSES = Object.freeze(['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED']);
export const SHOW_PROVENANCE = Object.freeze([
  'owner',
  'admin',
  'ai',
  'imported',
  'seeded',
]);

const SHOW_SECTION_HEADING = 'Shows';

export function parseJsonObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  return {};
}

function pickUrl(obj, keys) {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function normalizeKind(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const map = {
    video: 'video',
    slideshow: 'slideshow',
    graphic: 'graphic',
    image: 'graphic',
    campaign: 'campaign',
    promo: 'campaign',
    reel: 'reel',
    product_highlight: 'product_highlight',
    uploaded: 'uploaded',
    generated: 'generated',
  };
  return map[v] ?? 'graphic';
}

/** Legacy items without status are treated as PUBLISHED (backward compatible). */
export function normalizeShowStatus(raw) {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!s) return 'PUBLISHED';
  if (SHOW_STATUSES.includes(s)) return s;
  return 'PUBLISHED';
}

export function isShowPubliclyVisible(work) {
  return normalizeShowStatus(work?.status) === 'PUBLISHED';
}

/**
 * Normalize a featured work for management APIs.
 */
export function normalizeShowWork(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const mediaUrl = pickUrl(o, ['mediaUrl', 'url', 'videoUrl', 'imageUrl', 'src', 'href']);
  const thumbnailUrl =
    pickUrl(o, ['thumbnailUrl', 'thumbUrl', 'posterUrl', 'imageUrl', 'previewUrl']) ?? mediaUrl;
  if (!thumbnailUrl && !mediaUrl) return null;
  const id =
    (typeof o.id === 'string' && o.id.trim()) ||
    (typeof o.assetId === 'string' && o.assetId.trim()) ||
    `work-${index}`;
  const title =
    (typeof o.title === 'string' && o.title.trim()) ||
    (typeof o.name === 'string' && o.name.trim()) ||
    'Untitled';
  const kind = normalizeKind(o.type ?? o.kind ?? o.mediaType);
  const status = normalizeShowStatus(o.status);
  const provenanceRaw = String(o.provenance ?? o.source ?? 'seeded')
    .trim()
    .toLowerCase();
  const provenance = SHOW_PROVENANCE.includes(provenanceRaw) ? provenanceRaw : 'seeded';
  const sortOrder =
    typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder)
      ? o.sortOrder
      : typeof o.displayOrder === 'number' && Number.isFinite(o.displayOrder)
        ? o.displayOrder
        : index;
  return {
    id,
    title,
    description:
      typeof o.description === 'string'
        ? o.description
        : typeof o.caption === 'string'
          ? o.caption
          : '',
    kind,
    type: kind,
    mediaUrl,
    thumbnailUrl,
    ctaLabel: typeof o.ctaLabel === 'string' ? o.ctaLabel : undefined,
    ctaUrl: typeof o.ctaUrl === 'string' ? o.ctaUrl : typeof o.href === 'string' ? o.href : undefined,
    altText: typeof o.altText === 'string' ? o.altText : typeof o.accessibilityText === 'string' ? o.accessibilityText : '',
    status,
    provenance,
    sortOrder,
    uploadedAt:
      (typeof o.uploadedAt === 'string' && o.uploadedAt) ||
      (typeof o.createdAt === 'string' && o.createdAt) ||
      null,
    updatedAt:
      (typeof o.updatedAt === 'string' && o.updatedAt) ||
      (typeof o.uploadedAt === 'string' && o.uploadedAt) ||
      null,
    relevanceWarning:
      typeof o.relevanceWarning === 'string' && o.relevanceWarning.trim()
        ? o.relevanceWarning.trim()
        : null,
  };
}

export function listShowWorksFromSettings(storefrontSettings) {
  const base = parseJsonObject(storefrontSettings);
  const arr = Array.isArray(base.featuredWorks) ? base.featuredWorks : [];
  return arr
    .map((item, i) => normalizeShowWork(item, i))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const at = Date.parse(a.updatedAt || a.uploadedAt || '') || 0;
      const bt = Date.parse(b.updatedAt || b.uploadedAt || '') || 0;
      return bt - at;
    });
}

function syncShowSectionItems(stylePreferences, works) {
  const sp = parseJsonObject(stylePreferences);
  const { sections: prevSections, theme, miniBase } = getMiniWebsiteSnapshot(sp);
  const sections = Array.isArray(prevSections) ? prevSections.map((s) => ({ ...s })) : [];
  let showSection = sections.find((s) => s && typeof s === 'object' && String(s.type) === 'show');
  if (!showSection) {
    showSection = { type: 'show', content: { heading: SHOW_SECTION_HEADING, items: [] } };
    const uspIdx = sections.findIndex((s) => s?.type === 'usp_bar');
    if (uspIdx >= 0) sections.splice(uspIdx + 1, 0, showSection);
    else {
      const heroIdx = sections.findIndex((s) => s?.type === 'hero');
      sections.splice(heroIdx >= 0 ? heroIdx + 1 : 0, 0, showSection);
    }
  }
  const content =
    showSection.content && typeof showSection.content === 'object' && !Array.isArray(showSection.content)
      ? { ...showSection.content }
      : {};
  showSection.content = {
    ...content,
    heading: SHOW_SECTION_HEADING,
    items: works,
  };
  return {
    ...sp,
    miniWebsite: {
      ...miniBase,
      sections,
      theme,
      updatedAt: new Date().toISOString(),
    },
  };
}

function writeWorks(storefrontSettings, stylePreferences, works) {
  const base = parseJsonObject(storefrontSettings);
  const nextSettings = { ...base, featuredWorks: works };
  const nextPrefs = syncShowSectionItems(stylePreferences, works);
  return { storefrontSettings: nextSettings, stylePreferences: nextPrefs };
}

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ storeId: string, includeArchived?: boolean, statusFilter?: string | null }} args
 */
export async function listStoreShows(prisma, { storeId, includeArchived = false, statusFilter = null }) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, storefrontSettings: true, name: true, type: true, description: true },
  });
  if (!store) throw httpError(404, 'store_not_found', 'Store not found');
  let works = listShowWorksFromSettings(store.storefrontSettings);
  if (!includeArchived) {
    works = works.filter((w) => w.status !== 'ARCHIVED');
  }
  if (statusFilter && SHOW_STATUSES.includes(String(statusFilter).toUpperCase())) {
    const want = String(statusFilter).toUpperCase();
    works = works.filter((w) => w.status === want);
  }
  return { storeId: store.id, storeName: store.name, works };
}

/**
 * Persist full works array (transactional update of Business JSON only).
 */
export async function persistStoreShows(prisma, { storeId, works, actorId = null, reason = null }) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, storefrontSettings: true, stylePreferences: true },
  });
  if (!store) throw httpError(404, 'store_not_found', 'Store not found');
  const normalized = works.map((w, i) => normalizeShowWork(w, i)).filter(Boolean);
  const { storefrontSettings, stylePreferences } = writeWorks(
    store.storefrontSettings,
    store.stylePreferences,
    normalized,
  );
  await prisma.business.update({
    where: { id: storeId },
    data: {
      storefrontSettings,
      stylePreferences,
      updatedAt: new Date(),
    },
  });

  try {
    await prisma.auditEvent.create({
      data: {
        entityType: 'Business',
        entityId: storeId,
        action: 'store_shows_update',
        actorType: actorId ? 'human' : 'system',
        actorId: actorId ?? null,
        reason: reason || 'store_shows_mutation',
        metadata: {
          count: normalized.length,
          reason,
          workIds: normalized.map((w) => w.id).slice(0, 50),
          // fingerprints only — no media query tokens
          fingerprints: normalized.slice(0, 20).map((w) => ({
            id: w.id,
            titleLen: String(w.title || '').length,
            descriptionLen: String(w.description || '').length,
            status: w.status,
            updatedAt: w.updatedAt || null,
          })),
        },
      },
    });
  } catch {
    /* non-fatal */
  }

  return { storeId, works: normalized };
}

export async function getStoreShow(prisma, { storeId, workId }) {
  const { works } = await listStoreShows(prisma, { storeId, includeArchived: true });
  const work = works.find((w) => w.id === workId);
  if (!work) throw httpError(404, 'show_not_found', 'Show not found');
  return work;
}

export async function upsertStoreShow(prisma, { storeId, workId = null, patch, actorId, provenance = 'owner', reason = null }) {
  const { works } = await listStoreShows(prisma, { storeId, includeArchived: true });
  const now = new Date().toISOString();
  let next;
  if (workId) {
    const idx = works.findIndex((w) => w.id === workId);
    if (idx < 0) throw httpError(404, 'show_not_found', 'Show not found');
    const prev = works[idx];
    next = [...works];
    next[idx] = normalizeShowWork(
      {
        ...prev,
        ...patch,
        id: prev.id,
        provenance: prev.provenance || provenance,
        updatedAt: now,
        status: patch.status != null ? normalizeShowStatus(patch.status) : prev.status,
      },
      idx,
    );
  } else {
    const id = `show-${randomUUID()}`;
    const created = normalizeShowWork(
      {
        id,
        title: patch.title || 'Untitled',
        description: patch.description || '',
        kind: patch.kind || 'graphic',
        mediaUrl: patch.mediaUrl || null,
        thumbnailUrl: patch.thumbnailUrl || patch.mediaUrl || null,
        ctaLabel: patch.ctaLabel,
        ctaUrl: patch.ctaUrl,
        altText: patch.altText || '',
        status: normalizeShowStatus(patch.status || 'DRAFT'),
        provenance,
        sortOrder: typeof patch.sortOrder === 'number' ? patch.sortOrder : works.length,
        uploadedAt: now,
        updatedAt: now,
      },
      works.length,
    );
    if (!created) throw httpError(400, 'invalid_show', 'Show requires media or thumbnail');
    next = [...works, created];
  }
  return persistStoreShows(prisma, { storeId, works: next, actorId, reason });
}

export async function setStoreShowStatus(prisma, { storeId, workId, status, actorId, reason }) {
  const want = normalizeShowStatus(status);
  if (!SHOW_STATUSES.includes(want)) throw httpError(400, 'invalid_status', 'Invalid status');
  return upsertStoreShow(prisma, {
    storeId,
    workId,
    patch: { status: want },
    actorId,
    reason: reason || `show_${want.toLowerCase()}`,
  });
}

export async function reorderStoreShows(prisma, { storeId, orderedIds, actorId }) {
  const { works } = await listStoreShows(prisma, { storeId, includeArchived: true });
  const byId = new Map(works.map((w) => [w.id, w]));
  const next = [];
  for (const id of orderedIds) {
    const w = byId.get(id);
    if (w) {
      next.push({ ...w, sortOrder: next.length, updatedAt: new Date().toISOString() });
      byId.delete(id);
    }
  }
  for (const w of byId.values()) {
    next.push({ ...w, sortOrder: next.length });
  }
  return persistStoreShows(prisma, {
    storeId,
    works: next,
    actorId,
    reason: 'show_reorder',
  });
}

/** Deterministic relevance hint (not AI authority). */
export function buildRelevanceWarning(work, store) {
  const title = `${work.title || ''} ${work.description || ''}`.toLowerCase();
  const storeBlob = `${store?.name || ''} ${store?.type || ''} ${store?.description || ''}`.toLowerCase();
  const mismatchTokens = [
    'assessment',
    'consulting',
    'package',
    'logistics',
    'swimming',
    'software',
    'saas',
    'tax ',
    'legal advice',
  ];
  const flowerTokens = ['flower', 'florist', 'bouquet', 'bloom', 'plant'];
  const hit = mismatchTokens.find((t) => title.includes(t));
  if (!hit) return null;
  const looksFloral = flowerTokens.some((t) => storeBlob.includes(t));
  if (!looksFloral) return null;
  return 'This content may not match this business.';
}
