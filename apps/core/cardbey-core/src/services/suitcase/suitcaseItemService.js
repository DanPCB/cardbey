/**
 * Phase 10 — Suitcase account knowledge vault (owner-scoped CRUD + search).
 */
import cuid from 'cuid';
import { getPrismaClient } from '../../lib/prisma.js';

export const SUITCASE_SOURCE_TYPES = new Set([
  'upload',
  'scan',
  'mission_output',
  'business_briefing',
  'business_report',
  'artifact',
  'campaign_asset',
  'offer_draft',
  'video',
  'slideshow',
  'document',
  'system_note',
]);

export const SUITCASE_CONTENT_TYPES = new Set([
  'text',
  'image',
  'video',
  'pdf',
  'json',
  'link',
  'mixed',
]);

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

function jsonStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return 'null';
  }
}

function jsonParse(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function modelAvailable(prisma) {
  const delegate = prisma?.suitcaseItem;
  return Boolean(
    delegate &&
      (typeof delegate.findFirst === 'function' ||
        typeof delegate.findUnique === 'function' ||
        typeof delegate.create === 'function'),
  );
}

function assertOwnerId(ownerId) {
  const oid = String(ownerId ?? '').trim();
  if (!oid) {
    const err = new Error('ownerId is required');
    err.statusCode = 400;
    throw err;
  }
  return oid;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.ownerId,
    spaceId: row.spaceId ?? null,
    storeId: row.storeId ?? null,
    missionId: row.missionId ?? null,
    sourceType: row.sourceType,
    contentType: row.contentType,
    title: row.title,
    description: row.description ?? null,
    summary: row.summary ?? null,
    tags: jsonParse(row.tagsJson, []),
    metadata: jsonParse(row.metadataJson, {}),
    fileUrl: row.fileUrl ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    payload: jsonParse(row.payloadJson, null),
    visibility: row.visibility ?? 'private',
    embeddingStatus: row.embeddingStatus ?? 'pending',
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 50);
}

function buildBriefingIdempotencyKey(ownerId, storeId, snapshotId) {
  return `briefing:${String(ownerId).trim()}:${String(storeId).trim()}:${String(snapshotId).trim()}`;
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.createdAt || !parsed?.id) return null;
    return { createdAt: new Date(parsed.createdAt), id: String(parsed.id) };
  } catch {
    return null;
  }
}

function encodeCursor(row) {
  if (!row?.createdAt || !row?.id) return null;
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  return Buffer.from(JSON.stringify({ createdAt, id: row.id }), 'utf8').toString('base64url');
}

function matchesQuery(row, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    row.title,
    row.summary,
    row.description,
    row.tagsJson,
    row.metadataJson,
    row.payloadJson,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  return haystacks.some((h) => h.includes(q));
}

/**
 * @param {object} input
 */
export async function createSuitcaseItem(input, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma)) {
    return { item: null, skipped: true };
  }

  const ownerId = assertOwnerId(input.ownerId);
  const sourceType = String(input.sourceType ?? '').trim();
  const contentType = String(input.contentType ?? '').trim();
  const title = String(input.title ?? '').trim();

  if (!sourceType || !SUITCASE_SOURCE_TYPES.has(sourceType)) {
    const err = new Error('Invalid sourceType');
    err.statusCode = 400;
    throw err;
  }
  if (!contentType || !SUITCASE_CONTENT_TYPES.has(contentType)) {
    const err = new Error('Invalid contentType');
    err.statusCode = 400;
    throw err;
  }
  if (!title) {
    const err = new Error('title is required');
    err.statusCode = 400;
    throw err;
  }

  const idempotencyKey =
    typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim()
      : null;

  if (idempotencyKey) {
    const existing = await prisma.suitcaseItem.findUnique({ where: { idempotencyKey } });
    if (existing && existing.ownerId === ownerId) {
      return { item: mapRow(existing), created: false, skipped: false };
    }
    if (existing && existing.ownerId !== ownerId) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
  }

  const now = new Date();
  const row = await prisma.suitcaseItem.create({
    data: {
      id: cuid(),
      ownerId,
      spaceId: input.spaceId ? String(input.spaceId).trim() : null,
      storeId: input.storeId ? String(input.storeId).trim() : null,
      missionId: input.missionId ? String(input.missionId).trim() : null,
      sourceType,
      contentType,
      title,
      description: input.description ? String(input.description) : null,
      summary: input.summary ? String(input.summary) : null,
      tagsJson: jsonStringify(normalizeTags(input.tags)),
      metadataJson: jsonStringify(input.metadata ?? {}),
      fileUrl: input.fileUrl ? String(input.fileUrl) : null,
      thumbnailUrl: input.thumbnailUrl ? String(input.thumbnailUrl) : null,
      payloadJson: input.payload != null ? jsonStringify(input.payload) : null,
      visibility: input.visibility === 'shared' || input.visibility === 'public' ? input.visibility : 'private',
      embeddingStatus:
        input.embeddingStatus === 'indexed' || input.embeddingStatus === 'failed'
          ? input.embeddingStatus
          : 'pending',
      idempotencyKey,
      updatedAt: now,
    },
  });

  return { item: mapRow(row), created: true, skipped: false };
}

/**
 * @param {object} filters
 */
export async function listSuitcaseItems(filters = {}, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma)) {
    return { items: [], nextCursor: null, skipped: true };
  }

  const ownerId = assertOwnerId(filters.ownerId);
  const limit = Math.min(Math.max(Number(filters.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursor = decodeCursor(filters.cursor);

  const where = { ownerId };
  if (filters.storeId) where.storeId = String(filters.storeId).trim();
  if (filters.spaceId) where.spaceId = String(filters.spaceId).trim();
  if (filters.sourceType) where.sourceType = String(filters.sourceType).trim();
  if (filters.contentType) where.contentType = String(filters.contentType).trim();
  if (filters.missionId) where.missionId = String(filters.missionId).trim();

  const query = String(filters.query ?? '').trim();

  const rows = await prisma.suitcaseItem.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query ? MAX_LIMIT * 3 : limit + 1,
    ...(cursor
      ? {
          cursor: { id: cursor.id },
          skip: 1,
        }
      : {}),
  });

  let filtered = rows;
  if (cursor) {
    filtered = rows.filter((r) => {
      const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime();
      const ct = cursor.createdAt.getTime();
      return t < ct || (t === ct && String(r.id) < cursor.id);
    });
  }

  if (query) {
    filtered = filtered.filter((r) => matchesQuery(r, query)).slice(0, limit + 1);
  }

  const hasMore = filtered.length > limit;
  const page = hasMore ? filtered.slice(0, limit) : filtered;
  const nextCursor = hasMore && page.length ? encodeCursor(page[page.length - 1]) : null;

  return {
    items: page.map(mapRow),
    nextCursor,
    skipped: false,
  };
}

export async function getSuitcaseItem({ ownerId, itemId }, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma)) {
    return { item: null, skipped: true };
  }
  const oid = assertOwnerId(ownerId);
  const id = String(itemId ?? '').trim();
  if (!id) {
    const err = new Error('itemId is required');
    err.statusCode = 400;
    throw err;
  }
  const row = await prisma.suitcaseItem.findFirst({ where: { id, ownerId: oid } });
  if (!row) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  return { item: mapRow(row), skipped: false };
}

export async function updateSuitcaseItem({ ownerId, itemId, patch }, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma)) {
    return { item: null, skipped: true };
  }
  const oid = assertOwnerId(ownerId);
  const id = String(itemId ?? '').trim();
  if (!id) {
    const err = new Error('itemId is required');
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.suitcaseItem.findFirst({ where: { id, ownerId: oid } });
  if (!existing) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  const data = {};
  if (patch.title != null) data.title = String(patch.title).trim() || existing.title;
  if (patch.description !== undefined) data.description = patch.description ? String(patch.description) : null;
  if (patch.summary !== undefined) data.summary = patch.summary ? String(patch.summary) : null;
  if (patch.tags !== undefined) data.tagsJson = jsonStringify(normalizeTags(patch.tags));
  if (patch.metadata !== undefined) data.metadataJson = jsonStringify(patch.metadata ?? {});
  if (patch.payload !== undefined) data.payloadJson = patch.payload != null ? jsonStringify(patch.payload) : null;
  if (patch.fileUrl !== undefined) data.fileUrl = patch.fileUrl ? String(patch.fileUrl) : null;
  if (patch.thumbnailUrl !== undefined) data.thumbnailUrl = patch.thumbnailUrl ? String(patch.thumbnailUrl) : null;
  if (patch.missionId !== undefined) data.missionId = patch.missionId ? String(patch.missionId) : null;
  if (patch.spaceId !== undefined) data.spaceId = patch.spaceId ? String(patch.spaceId) : null;
  if (patch.storeId !== undefined) data.storeId = patch.storeId ? String(patch.storeId) : null;
  if (patch.visibility === 'private' || patch.visibility === 'shared' || patch.visibility === 'public') {
    data.visibility = patch.visibility;
  }
  if (
    patch.embeddingStatus === 'pending' ||
    patch.embeddingStatus === 'indexed' ||
    patch.embeddingStatus === 'failed'
  ) {
    data.embeddingStatus = patch.embeddingStatus;
  }

  const row = await prisma.suitcaseItem.update({ where: { id }, data });
  return { item: mapRow(row), skipped: false };
}

export async function deleteSuitcaseItem({ ownerId, itemId }, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma)) {
    return { deleted: false, skipped: true };
  }
  const oid = assertOwnerId(ownerId);
  const id = String(itemId ?? '').trim();
  if (!id) {
    const err = new Error('itemId is required');
    err.statusCode = 400;
    throw err;
  }
  const existing = await prisma.suitcaseItem.findFirst({ where: { id, ownerId: oid } });
  if (!existing) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  await prisma.suitcaseItem.delete({ where: { id } });
  return { deleted: true, skipped: false };
}

/**
 * Idempotent business briefing save (ownerId + storeId + snapshotId).
 */
export async function saveBusinessBriefingSuitcaseItem(input, prisma = getPrismaClient()) {
  const ownerId = assertOwnerId(input.ownerId);
  const storeId = String(input.storeId ?? '').trim();
  const snapshotId = String(input.snapshotId ?? '').trim();
  const briefing = input.briefing ?? {};
  const storeName = String(input.storeName ?? briefing.storeName ?? 'Store').trim() || 'Store';

  if (!storeId || !snapshotId) {
    const err = new Error('storeId and snapshotId are required');
    err.statusCode = 400;
    throw err;
  }

  const summary =
    Array.isArray(briefing.todaySummary) && briefing.todaySummary.length
      ? String(briefing.todaySummary[0])
      : Array.isArray(briefing.needsAttention) && briefing.needsAttention.length
        ? String(briefing.needsAttention[0])
        : null;

  return createSuitcaseItem(
    {
      ownerId,
      storeId,
      sourceType: 'business_briefing',
      contentType: 'json',
      title: `Business briefing — ${storeName}`,
      summary,
      tags: ['briefing', 'business'],
      metadata: {
        storeId,
        snapshotId,
        generatedBy: 'performer_cooperator',
        version: 'phase_10',
      },
      payload: {
        greeting: briefing.greeting,
        storeName: briefing.storeName ?? storeName,
        healthScore: briefing.healthScore,
        todaySummary: briefing.todaySummary ?? [],
        needsAttention: briefing.needsAttention ?? [],
        recentExperience: briefing.recentExperience ?? [],
        ownerContext: briefing.ownerContext ?? [],
        suggestedActions: briefing.suggestedActions ?? [],
      },
      idempotencyKey: buildBriefingIdempotencyKey(ownerId, storeId, snapshotId),
    },
    prisma,
  );
}

export { buildBriefingIdempotencyKey, mapRow };
