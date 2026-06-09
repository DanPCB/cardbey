// DANH: skill-round6-document
/**
 * create_promotions_from_document — storePromo drafts for campaigns, offers, and events.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../prisma.js';
import { runCriticalSqliteWriteWithP1008Retry } from '../../sqliteCriticalWrite.js';
import { parseDocumentDeadline } from '../../../services/documentExtraction/parseDocumentDeadline.js';

/**
 * @param {string | null | undefined} raw
 * @returns {Date | null}
 */
function parseEventDate(raw) {
  return parseDocumentDeadline(raw);
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
  const productIds = Array.isArray(input?.productIds) ? input.productIds.filter(Boolean) : [];
  const productsExpected =
    typeof input?.productsExpected === 'number'
      ? input.productsExpected
      : Array.isArray(data?.products)
        ? data.products.length
        : 0;

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
        created: [],
        skipped: [],
        count: 0,
        reason: 'No extracted document data',
        promos: [],
      },
    };
  }

  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  const offers = Array.isArray(data.offers) ? data.offers : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const docCampaign = data.campaign && typeof data.campaign === 'object' ? data.campaign : null;

  /** Document had products but step 2 created none — avoid orphaned campaign promos. */
  const blockCampaignPromos = productsExpected > 0 && productIds.length === 0;

  /** @type {Array<object>} */
  const candidates = [];
  /** @type {Array<{ title: string, reason: string }>} */
  const skipped = [];

  for (const campaign of campaigns) {
    const title = String(campaign?.name ?? '').trim();
    if (!title) continue;
    if (blockCampaignPromos) {
      skipped.push({ title, reason: 'no_linked_products' });
      continue;
    }
    candidates.push({
      title,
      description: String(campaign?.copy ?? campaign?.description ?? '').slice(0, 500) || null,
      channel: campaign?.channel ? String(campaign.channel) : null,
      urgency: campaign?.urgency ? String(campaign.urgency) : null,
      promoType: 'campaign',
      source: 'campaign',
    });
  }

  if (docCampaign && String(docCampaign.name ?? '').trim()) {
    const title = String(docCampaign.name).trim();
    if (blockCampaignPromos) {
      skipped.push({ title, reason: 'no_linked_products' });
    } else {
      candidates.push({
        title,
        description: String(docCampaign.copy ?? '').slice(0, 500) || null,
        channel: docCampaign.channel ? String(docCampaign.channel) : null,
        urgency: docCampaign.urgency ? String(docCampaign.urgency) : null,
        promoType: 'campaign',
        source: 'campaign',
      });
    }
  }

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
      promoType: 'discount',
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
      promoType: 'event',
      source: 'event',
    });
  }

  if (!candidates.length) {
    return {
      status: 'ok',
      output: {
        created: [],
        skipped,
        count: 0,
        reason: blockCampaignPromos
          ? 'Campaign promos skipped — document products failed to create; no productIds to link'
          : 'No campaigns, offers, or events in document',
        promos: [],
        blockCampaignPromos,
      },
    };
  }

  const prisma = getPrismaClient();
  /** @type {string[]} */
  const created = [];
  /** @type {Array<object>} */
  const promos = [];

  for (let i = 0; i < candidates.slice(0, 20).length; i += 1) {
    const c = candidates[i];
    const urgencyDays = c.endsAt ? daysUntil(c.endsAt) : null;
    const slug = `doc-${storeId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    const productId =
      c.promoType === 'campaign' && productIds.length
        ? productIds[i] ?? productIds[0]
        : productIds[i] ?? productIds[0] ?? null;
    const subtitleParts = [c.urgency, c.channel, c.venue].filter(Boolean);
    try {
      const row = await runCriticalSqliteWriteWithP1008Retry(
        () =>
          prisma.storePromo.create({
            data: {
              storeId,
              productId: productId ?? undefined,
              title: c.title,
              description: c.description,
              targetUrl: `/store/${storeId}`,
              slug,
              isActive: false,
              endsAt: c.endsAt ?? undefined,
              promoType: c.promoType ?? 'campaign',
              subtitle:
                subtitleParts.length > 0
                  ? subtitleParts.join(' · ').slice(0, 120)
                  : urgencyDays != null
                    ? `${urgencyDays} day(s) until event`
                    : null,
            },
          }),
        { label: 'create_promotions_from_document', logPrefix: '[create_promotions_from_document]' },
      );
      created.push(row.id);
      promos.push({
        promoId: row.id,
        title: row.title,
        productId: row.productId ?? null,
        endsAt: row.endsAt,
        urgencyDays,
        source: c.source,
        channel: c.channel ?? null,
      });
    } catch (err) {
      promos.push({
        title: c.title,
        created: false,
        error: err?.message ?? String(err),
      });
    }
  }

  return {
    status: 'ok',
    output: {
      created,
      skipped,
      count: created.length,
      promos,
      blockCampaignPromos,
      message: `Created ${created.length} promotion draft(s) from document`,
    },
  };
}

export default execute;
