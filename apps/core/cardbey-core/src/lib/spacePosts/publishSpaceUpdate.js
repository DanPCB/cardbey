/**
 * Publish an explicit Space Update as public_lifecycle StoreActivityEvent.
 * Authoritative object: StoreActivityEvent (SPACE_UPDATE) — no SpacePost table.
 */

import { randomUUID } from 'node:crypto';
import {
  PUBLIC_LIFECYCLE_EVENT_TYPES,
  SPACE_UPDATE_DISTRIBUTION,
  emitPublicStoreLifecycleEvent,
  projectLifecycleRow,
} from '../publicStoreLifecycle/publicStoreLifecycleEvents.js';
import { bumpPublicFeedRankForStore } from '../feed/publicFeedRankBump.js';
import { assertStoreOwner } from '../storeReadiness/aggregator.js';
import { isPlatformAdmin } from '../authorization.js';
import { upsertStoreShow } from '../../services/storeShows/storeShowsService.js';

const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_MEDIA_URL = 2048;

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function safeHttpUrl(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s.length > MAX_MEDIA_URL) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @param {string | null | undefined} titleHint
 */
function deriveTitleAndBody(text, titleHint) {
  const body = String(text ?? '').trim().slice(0, MAX_BODY);
  const hint = typeof titleHint === 'string' ? titleHint.trim() : '';
  if (hint) {
    return { title: hint.slice(0, MAX_TITLE), description: body || null };
  }
  const firstLine = body.split(/\r?\n/).find((l) => l.trim()) || body;
  const title = firstLine.slice(0, MAX_TITLE) || 'Update';
  const description =
    body.length > title.length || body.includes('\n') ? body.slice(0, MAX_BODY) : body !== title ? body : null;
  return { title, description };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   storeId: string,
 *   userId: string,
 *   user?: object | null,
 *   text?: string,
 *   title?: string | null,
 *   mediaUrl?: string | null,
 *   mediaKind?: string | null,
 *   productId?: string | null,
 *   serviceId?: string | null,
 *   promotionId?: string | null,
 *   distribution?: string | null,
 *   idempotencyKey?: string | null,
 *   attachToShows?: boolean,
 * }} input
 */
export async function publishSpaceUpdate(prisma, input) {
  const storeId = String(input?.storeId ?? '').trim();
  const userId = String(input?.userId ?? '').trim();
  if (!prisma || !storeId || !userId) {
    return { ok: false, status: 400, error: 'invalid_input' };
  }

  const ownership = await assertStoreOwner(prisma, storeId, userId);
  const adminOk = isPlatformAdmin(input.user);
  if (!ownership.ok && !adminOk) {
    const status = ownership.reason === 'not_found' ? 404 : ownership.reason === 'unauthenticated' ? 401 : 403;
    return {
      ok: false,
      status,
      error: ownership.reason === 'not_found' ? 'store_not_found' : 'forbidden',
    };
  }

  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true, name: true, isActive: true, type: true, description: true },
  });
  if (!store) {
    return { ok: false, status: 404, error: 'store_not_found' };
  }

  const text = String(input?.text ?? '').trim();
  const mediaUrl = safeHttpUrl(input?.mediaUrl);
  if (!text && !mediaUrl) {
    return { ok: false, status: 400, error: 'text_or_media_required' };
  }
  if (input?.mediaUrl && !mediaUrl) {
    return { ok: false, status: 400, error: 'invalid_media_url' };
  }

  const distributionRaw = String(input?.distribution ?? SPACE_UPDATE_DISTRIBUTION.SPACE_ONLY).trim();
  const distribution =
    distributionRaw === SPACE_UPDATE_DISTRIBUTION.GLOBAL_ELIGIBLE
      ? SPACE_UPDATE_DISTRIBUTION.GLOBAL_ELIGIBLE
      : SPACE_UPDATE_DISTRIBUTION.SPACE_ONLY;

  const productId =
    typeof input.productId === 'string' && input.productId.trim() ? input.productId.trim() : null;
  const serviceId =
    typeof input.serviceId === 'string' && input.serviceId.trim() ? input.serviceId.trim() : null;
  const promotionId =
    typeof input.promotionId === 'string' && input.promotionId.trim() ? input.promotionId.trim() : null;

  if (productId || serviceId) {
    const catalogId = productId || serviceId;
    const product = await prisma.product.findFirst({
      where: { id: catalogId, businessId: storeId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      return { ok: false, status: 400, error: 'invalid_catalog_reference' };
    }
  }
  if (promotionId) {
    const promo = await prisma.promotion.findFirst({
      where: { id: promotionId, storeId },
      select: { id: true },
    });
    if (!promo) {
      return { ok: false, status: 400, error: 'invalid_promotion_reference' };
    }
  }

  const idempotencyKey =
    typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim().slice(0, 180)
      : null;
  const entityId = idempotencyKey || `space-update:${randomUUID()}`;

  const { title, description } = deriveTitleAndBody(text || 'Photo update', input?.title);
  const mediaKindRaw = String(input?.mediaKind ?? '').toLowerCase();
  const mediaKind =
    mediaUrl && (mediaKindRaw === 'video' || mediaKindRaw === 'image')
      ? mediaKindRaw
      : mediaUrl
        ? /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl)
          ? 'video'
          : 'image'
        : null;

  let showWorkId = null;
  const wantShow =
    Boolean(mediaUrl) && input.attachToShows !== false && store.isActive;
  if (wantShow) {
    try {
      const showResult = await upsertStoreShow(prisma, {
        storeId,
        workId: null,
        patch: {
          title,
          description: description || '',
          kind: mediaKind === 'video' ? 'video' : 'graphic',
          mediaUrl,
          thumbnailUrl: mediaUrl,
          status: 'PUBLISHED',
          altText: title,
        },
        actorId: userId,
        provenance: 'owner',
        reason: 'space_update_media',
      });
      const works = Array.isArray(showResult?.works) ? showResult.works : [];
      const created = works[works.length - 1];
      showWorkId = created?.id || null;
    } catch (err) {
      console.warn('[publishSpaceUpdate] show attach failed', storeId, err?.message ?? err);
    }
  }

  const emit = await emitPublicStoreLifecycleEvent(prisma, {
    storeId,
    eventType: PUBLIC_LIFECYCLE_EVENT_TYPES.SPACE_UPDATE,
    title,
    description,
    entityId,
    actorUserId: userId,
    metadata: {
      distribution,
      mediaUrl,
      mediaKind,
      productId,
      serviceId,
      promotionId,
      showWorkId,
      actorIdentity: 'business',
      spacePostV1: true,
    },
  });

  if (!emit.ok) {
    return { ok: false, status: 500, error: emit.error || 'emit_failed' };
  }

  let globalRankBumped = false;
  let publishedAt = null;
  if (
    !emit.deduped &&
    distribution === SPACE_UPDATE_DISTRIBUTION.GLOBAL_ELIGIBLE &&
    store.isActive
  ) {
    try {
      publishedAt = await bumpPublicFeedRankForStore(prisma, storeId, {
        reason: 'space_update_global_eligible',
      });
      globalRankBumped = Boolean(publishedAt);
    } catch (err) {
      console.warn('[publishSpaceUpdate] rank bump failed', storeId, err?.message ?? err);
    }
  }

  const eventRow = emit.event
    ? projectLifecycleRow({
        id: emit.event.id,
        eventType: emit.event.eventType,
        createdAt: emit.event.createdAt,
        metadataJson: emit.event.metadataJson,
      })
    : emit.deduped
      ? {
          id: emit.eventId,
          type: PUBLIC_LIFECYCLE_EVENT_TYPES.SPACE_UPDATE,
          title,
          description,
          entityId,
          createdAt: new Date().toISOString(),
          freshness: 'just_launched',
          mediaUrl,
          mediaKind,
          distribution,
          productId,
          serviceId,
          promotionId,
          showWorkId,
          actorIdentity: 'business',
        }
      : null;

  return {
    ok: true,
    status: emit.deduped ? 200 : 201,
    deduped: Boolean(emit.deduped),
    storeId,
    actorIdentity: 'business',
    distribution,
    globalRankBumped,
    publishedAt: publishedAt ? publishedAt.toISOString() : null,
    showWorkId,
    event: eventRow,
    spaceHref: `/space/${encodeURIComponent(storeId)}`,
  };
}
