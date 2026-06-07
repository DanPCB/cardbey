// DANH: skill-round6-document
/**
 * create_promotions_from_document — storePromo drafts for date-limited offers/events.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../prisma.js';

/**
 * @param {string | null | undefined} raw
 * @returns {Date | null}
 */
function parseEventDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Date | null} eventDate
 */
function daysUntil(eventDate) {
  if (!eventDate) return null;
  const now = new Date();
  const ms = eventDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const extracted = input?.extracted === true;
  const data = input?.data && typeof input.data === 'object' ? input.data : null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
    };
  }

  if (!extracted || !data) {
    return {
      status: 'ok',
      output: {
        created: false,
        count: 0,
        reason: 'No extracted document data',
        promos: [],
      },
    };
  }

  const offers = Array.isArray(data.offers) ? data.offers : [];
  const events = Array.isArray(data.events) ? data.events : [];

  /** @type {Array<object>} */
  const candidates = [];

  for (const offer of offers) {
    const title = String(offer?.title ?? '').trim();
    if (!title) continue;
    const eventDate = parseEventDate(offer.eventDate || offer.endsAt || offer.startsAt);
    if (!eventDate) continue;
    candidates.push({
      title,
      description: String(offer?.description ?? offer?.discount ?? '').slice(0, 500) || null,
      endsAt: eventDate,
      venue: offer?.venue ? String(offer.venue) : null,
      source: 'offer',
    });
  }

  for (const event of events) {
    const title = String(event?.name ?? '').trim();
    if (!title) continue;
    const eventDate = parseEventDate(event?.date);
    if (!eventDate) continue;
    const highlights = Array.isArray(event?.highlights) ? event.highlights.join(', ') : '';
    candidates.push({
      title,
      description: highlights.slice(0, 500) || null,
      endsAt: eventDate,
      venue: event?.venue ? String(event.venue) : null,
      source: 'event',
    });
  }

  if (!candidates.length) {
    return {
      status: 'ok',
      output: {
        created: false,
        count: 0,
        reason: 'No date-limited offers or events in document',
        promos: [],
      },
    };
  }

  const prisma = getPrismaClient();
  /** @type {Array<object>} */
  const promos = [];

  for (const c of candidates.slice(0, 20)) {
    const urgencyDays = daysUntil(c.endsAt);
    const slug = `doc-${storeId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    try {
      const row = await prisma.storePromo.create({
        data: {
          storeId,
          title: c.title,
          description: c.description,
          targetUrl: `/store/${storeId}`,
          slug,
          isActive: false,
          endsAt: c.endsAt ?? undefined,
          subtitle:
            urgencyDays != null
              ? `${urgencyDays} day(s) until event`
              : c.venue
                ? String(c.venue).slice(0, 120)
                : null,
        },
      });
      promos.push({
        promoId: row.id,
        title: row.title,
        endsAt: row.endsAt,
        urgencyDays,
        source: c.source,
      });
    } catch (err) {
      promos.push({
        title: c.title,
        created: false,
        error: err?.message ?? String(err),
      });
    }
  }

  const createdCount = promos.filter((p) => p.promoId).length;

  return {
    status: 'ok',
    output: {
      created: createdCount > 0,
      count: createdCount,
      promos,
      message: `Created ${createdCount} promotion draft(s) from document`,
    },
  };
}

export default execute;
