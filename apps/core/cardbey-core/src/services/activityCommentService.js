/**
 * Platform-wide activity comments — keyed by content-interactions identity.
 * One Comment domain for Business Space, Global, and future surfaces.
 */

const ALLOWED_TYPES = new Set([
  'feed_artifact',
  'show_item',
  'product',
  'service',
  'campaign',
  'store',
]);

const MAX_TEXT = 2000;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 30;

export function normalizeContentType(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  return ALLOWED_TYPES.has(t) ? t : null;
}

export function normalizeContentId(raw) {
  const id = String(raw ?? '').trim();
  return id.length > 0 && id.length <= 256 ? id : null;
}

export function sanitizeCommentText(raw) {
  const text = String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length > MAX_TEXT) return text.slice(0, MAX_TEXT);
  return text;
}

/**
 * Map StoreActivityEvent id → content-interactions key used by Space timeline.
 * @param {string} activityId
 */
export function publicLifecycleContentKey(activityId) {
  const id = String(activityId ?? '').trim();
  if (!id) return null;
  return {
    contentType: 'feed_artifact',
    contentId: `public_lifecycle:${id}`,
    activityId: id,
  };
}

/**
 * Resolve activityId from content key when present.
 * @param {string} contentType
 * @param {string} contentId
 */
export function activityIdFromContentKey(contentType, contentId) {
  if (contentType !== 'feed_artifact') return null;
  const m = /^public_lifecycle:(.+)$/.exec(String(contentId || ''));
  return m ? m[1] : null;
}

function actorFromUser(user) {
  if (!user || typeof user !== 'object') {
    return { id: null, displayName: 'User', avatarUrl: null, handle: null };
  }
  const displayName =
    String(user.displayName || user.fullName || user.handle || user.email || 'User').trim() ||
    'User';
  return {
    id: user.id ? String(user.id) : null,
    displayName,
    avatarUrl: user.avatarUrl || user.profilePhoto || null,
    handle: user.handle || null,
  };
}

function toCommentDto(row, userMap = new Map()) {
  const user = userMap.get(row.actorUserId) || null;
  return {
    id: row.id,
    text: row.text,
    parentCommentId: row.parentCommentId ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    actorType: row.actorType || 'user',
    actor: actorFromUser(user) || {
      id: row.actorUserId,
      displayName: 'User',
      avatarUrl: null,
      handle: null,
    },
  };
}

async function syncCommentsCount(prisma, contentType, contentId, meta = {}) {
  const total = await prisma.comment.count({
    where: { contentType, contentId, status: 'ACTIVE' },
  });
  const existing = await prisma.contentInteractionMetrics.findUnique({
    where: { contentType_contentId: { contentType, contentId } },
  });
  if (existing) {
    if (existing.commentsCount !== total) {
      await prisma.contentInteractionMetrics.update({
        where: { id: existing.id },
        data: { commentsCount: total },
      });
    }
  } else if (total > 0) {
    await prisma.contentInteractionMetrics.create({
      data: {
        contentType,
        contentId,
        storeId: meta.storeId ? String(meta.storeId) : null,
        artifactId: meta.artifactId ? String(meta.artifactId) : null,
        commentsCount: total,
      },
    });
  }
  return total;
}

/**
 * Ensure the activity/content target exists when it is a public_lifecycle event.
 */
export async function assertCommentTargetExists(prisma, contentType, contentId) {
  const activityId = activityIdFromContentKey(contentType, contentId);
  if (!activityId) {
    // Non-lifecycle targets: allow comment if metrics key is well-formed (shows, etc.).
    return { ok: true, activityId: null, storeId: null };
  }
  const event = await prisma.storeActivityEvent.findUnique({
    where: { id: activityId },
    select: { id: true, storeId: true, eventType: true, source: true },
  });
  if (!event) {
    return { ok: false, error: 'activity_not_found', status: 404 };
  }
  return { ok: true, activityId: event.id, storeId: event.storeId };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function listActivityComments(prisma, input) {
  const contentType = normalizeContentType(input.contentType);
  const contentId = normalizeContentId(input.contentId);
  if (!contentType || !contentId) {
    return { ok: false, status: 400, error: 'invalid_content' };
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(String(input.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  const cursor = input.cursor ? String(input.cursor).trim() : null;

  // Stable oldest→newest
  const rows = await prisma.comment.findMany({
    where: {
      contentType,
      contentId,
      status: 'ACTIVE',
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    ...(cursor
      ? {
          skip: 1,
          cursor: { id: cursor },
        }
      : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const actorIds = [...new Set(page.map((r) => r.actorUserId).filter(Boolean))];
  const users = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true,
          displayName: true,
          fullName: true,
          handle: true,
          email: true,
          avatarUrl: true,
          profilePhoto: true,
        },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const total = await syncCommentsCount(prisma, contentType, contentId, {
    storeId: input.storeId,
  });

  return {
    ok: true,
    comments: page.map((r) => toCommentDto(r, userMap)),
    total,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function createActivityComment(prisma, input) {
  const contentType = normalizeContentType(input.contentType);
  const contentId = normalizeContentId(input.contentId);
  const text = sanitizeCommentText(input.text);
  const actorUserId = String(input.actorUserId ?? '').trim();

  if (!contentType || !contentId) {
    return { ok: false, status: 400, error: 'invalid_content' };
  }
  if (!actorUserId) {
    return { ok: false, status: 401, error: 'auth_required' };
  }
  if (!text) {
    return { ok: false, status: 400, error: 'empty_comment' };
  }

  const target = await assertCommentTargetExists(prisma, contentType, contentId);
  if (!target.ok) {
    return { ok: false, status: target.status || 404, error: target.error || 'activity_not_found' };
  }

  const storeId =
    (input.storeId && String(input.storeId).trim()) ||
    target.storeId ||
    null;

  const row = await prisma.comment.create({
    data: {
      contentType,
      contentId,
      activityId: target.activityId || activityIdFromContentKey(contentType, contentId),
      storeId,
      actorUserId,
      actorType: String(input.actorType || 'user').trim() || 'user',
      text,
      parentCommentId: null,
      status: 'ACTIVE',
    },
  });

  const total = await syncCommentsCount(prisma, contentType, contentId, {
    storeId,
    artifactId: input.artifactId,
  });

  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      displayName: true,
      fullName: true,
      handle: true,
      email: true,
      avatarUrl: true,
      profilePhoto: true,
    },
  });

  return {
    ok: true,
    status: 201,
    comment: toCommentDto(row, new Map([[actorUserId, user]])),
    total,
  };
}
