/**
 * Public store lifecycle events — visitor-safe “just launched” signals.
 * Stored in StoreActivityEvent with dedicated eventType values (not engagement metrics).
 */
import { randomUUID } from 'node:crypto';

export const PUBLIC_LIFECYCLE_EVENT_TYPES = Object.freeze({
  LOYALTY_PROGRAM_PUBLISHED: 'LOYALTY_PROGRAM_PUBLISHED',
  CAMPAIGN_LAUNCHED: 'CAMPAIGN_LAUNCHED',
  OFFER_ACTIVATED: 'OFFER_ACTIVATED',
  PROMOTION_ACTIVATED: 'PROMOTION_ACTIVATED',
  /** Explicit Space Post publish (Business Space Content + optional Global eligibility). */
  SPACE_UPDATE: 'SPACE_UPDATE',
});

/** Distribution intent for SPACE_UPDATE — only GLOBAL_ELIGIBLE bumps public feed rank. */
export const SPACE_UPDATE_DISTRIBUTION = Object.freeze({
  SPACE_ONLY: 'SPACE_ONLY',
  GLOBAL_ELIGIBLE: 'GLOBAL_ELIGIBLE',
});

export const PUBLIC_LIFECYCLE_EVENT_TYPE_SET = new Set(
  Object.values(PUBLIC_LIFECYCLE_EVENT_TYPES),
);

const DEDUPE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_LIMIT = 20;
const JUST_LAUNCHED_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   storeId: string,
 *   eventType: string,
 *   title: string,
 *   entityId?: string | null,
 *   description?: string | null,
 *   actorUserId?: string | null,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function emitPublicStoreLifecycleEvent(prisma, input) {
  const storeId = String(input?.storeId ?? '').trim();
  const eventType = String(input?.eventType ?? '').trim();
  const title = String(input?.title ?? '').trim();
  if (!prisma || !storeId || !title || !PUBLIC_LIFECYCLE_EVENT_TYPE_SET.has(eventType)) {
    return { ok: false, error: 'invalid_input' };
  }

  const entityId =
    typeof input.entityId === 'string' && input.entityId.trim() ? input.entityId.trim() : null;

  try {
    if (entityId) {
      const since = new Date(Date.now() - DEDUPE_MS);
      const recent = await prisma.storeActivityEvent.findMany({
        where: {
          storeId,
          eventType,
          source: 'public_lifecycle',
          createdAt: { gte: since },
        },
        take: 30,
        select: { id: true, metadataJson: true },
      });
      const dup = recent.find((row) => {
        const meta =
          row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
            ? row.metadataJson
            : {};
        return meta.entityId === entityId;
      });
      if (dup) return { ok: true, deduped: true, eventId: dup.id };
    }

    const metadata = {
      ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      public: true,
      title,
      ...(input.description ? { description: String(input.description).slice(0, 280) } : {}),
      ...(entityId ? { entityId } : {}),
    };

    const event = await prisma.storeActivityEvent.create({
      data: {
        id: randomUUID(),
        storeId,
        actorUserId: input.actorUserId ?? null,
        sessionId: null,
        eventType,
        source: 'public_lifecycle',
        metadataJson: metadata,
      },
    });
    return { ok: true, event, deduped: false };
  } catch (err) {
    console.warn('[emitPublicStoreLifecycleEvent]', storeId, eventType, err?.message ?? err);
    return { ok: false, error: 'emit_failed' };
  }
}

/**
 * Load recent visitor-safe lifecycle events for a store.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {{ days?: number, limit?: number, now?: number }} [opts]
 */
export async function listPublicStoreLifecycleEvents(prisma, storeId, opts = {}) {
  const id = String(storeId ?? '').trim();
  if (!prisma || !id) return [];

  const days = Number.isFinite(opts.days) ? opts.days : DEFAULT_WINDOW_DAYS;
  const limit = Number.isFinite(opts.limit) ? opts.limit : DEFAULT_LIMIT;
  const now = opts.now ?? Date.now();
  const since = new Date(now - days * 24 * 60 * 60 * 1000);

  try {
    const rows = await prisma.storeActivityEvent.findMany({
      where: {
        storeId: id,
        eventType: { in: [...PUBLIC_LIFECYCLE_EVENT_TYPE_SET] },
        createdAt: { gte: since },
        source: 'public_lifecycle',
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      select: {
        id: true,
        eventType: true,
        createdAt: true,
        metadataJson: true,
      },
    });

    return rows.map((row) => projectLifecycleRow(row, now)).filter(Boolean);
  } catch (err) {
    console.warn('[listPublicStoreLifecycleEvents]', id, err?.message ?? err);
    return [];
  }
}

/**
 * @param {{ id: string, eventType: string, createdAt: Date, metadataJson: unknown }} row
 * @param {number} now
 */
export function projectLifecycleRow(row, now = Date.now()) {
  const meta =
    row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? /** @type {Record<string, unknown>} */ (row.metadataJson)
      : {};
  const title = typeof meta.title === 'string' ? meta.title.trim() : '';
  if (!title) return null;
  const createdMs = row.createdAt instanceof Date ? row.createdAt.getTime() : Date.parse(String(row.createdAt));
  const age = Number.isFinite(createdMs) ? now - createdMs : Number.POSITIVE_INFINITY;
  const distribution =
    meta.distribution === SPACE_UPDATE_DISTRIBUTION.GLOBAL_ELIGIBLE
      ? SPACE_UPDATE_DISTRIBUTION.GLOBAL_ELIGIBLE
      : meta.distribution === SPACE_UPDATE_DISTRIBUTION.SPACE_ONLY
        ? SPACE_UPDATE_DISTRIBUTION.SPACE_ONLY
        : null;

  return {
    id: row.id,
    type: row.eventType,
    title,
    description: typeof meta.description === 'string' ? meta.description : null,
    entityId: typeof meta.entityId === 'string' ? meta.entityId : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    freshness: age <= JUST_LAUNCHED_MS ? 'just_launched' : 'recent',
    mediaUrl: typeof meta.mediaUrl === 'string' ? meta.mediaUrl : null,
    mediaKind: typeof meta.mediaKind === 'string' ? meta.mediaKind : null,
    distribution,
    productId: typeof meta.productId === 'string' ? meta.productId : null,
    serviceId: typeof meta.serviceId === 'string' ? meta.serviceId : null,
    promotionId: typeof meta.promotionId === 'string' ? meta.promotionId : null,
    showWorkId: typeof meta.showWorkId === 'string' ? meta.showWorkId : null,
    actorIdentity: meta.actorIdentity === 'person' ? 'person' : 'business',
  };
}

/**
 * Soft backfill from entity createdAt when no lifecycle emit exists yet.
 * @param {Array<{ id: string, name?: string, title?: string, createdAt?: string | null }>} entities
 * @param {string} eventType
 * @param {number} [now]
 */
export function synthesizeLifecycleFromCreatedAt(entities, eventType, now = Date.now()) {
  if (!Array.isArray(entities) || !PUBLIC_LIFECYCLE_EVENT_TYPE_SET.has(eventType)) return [];
  const windowMs = DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const out = [];
  for (const entity of entities) {
    if (!entity?.id) continue;
    const title = (entity.name || entity.title || '').trim();
    if (!title) continue;
    const createdMs = entity.createdAt ? Date.parse(String(entity.createdAt)) : NaN;
    if (!Number.isFinite(createdMs) || now - createdMs > windowMs) continue;
    out.push({
      id: `synth:${eventType}:${entity.id}`,
      type: eventType,
      title,
      description: null,
      entityId: entity.id,
      createdAt: new Date(createdMs).toISOString(),
      freshness: now - createdMs <= JUST_LAUNCHED_MS ? 'just_launched' : 'recent',
      synthesized: true,
    });
  }
  return out;
}
