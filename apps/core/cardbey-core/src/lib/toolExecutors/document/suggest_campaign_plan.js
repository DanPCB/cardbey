// DANH: skill-round6-document
/**
 * suggest_campaign_plan — week-by-week content calendar with optional CampaignPlan persistence.
 */

import { getPrismaClient } from '../../prisma.js';
import { appendEvent } from '../../missionBlackboard.js';
import { parseDocumentDeadline } from '../../../services/documentExtraction/parseDocumentDeadline.js';

/**
 * @param {string | null | undefined} raw
 * @returns {Date | null}
 */
function parseEventDate(raw) {
  return parseDocumentDeadline(raw);
}

/**
 * @param {Date} anchor
 * @param {number} weeksBefore
 */
function scheduledDateFromWeeksBefore(anchor, weeksBefore) {
  const d = new Date(anchor);
  d.setDate(d.getDate() - weeksBefore * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} weekLabel
 * @returns {number | null}
 */
function parseWeeksBefore(weekLabel) {
  const m = String(weekLabel ?? '').match(/-?\s*(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Date} eventDate
 * @param {number} weeksBefore
 */
function weekLabel(eventDate, weeksBefore) {
  if (weeksBefore <= 0) return 'Event week';
  const start = new Date(eventDate);
  start.setDate(start.getDate() - weeksBefore * 7);
  return `Week -${weeksBefore} (${start.toISOString().slice(0, 10)})`;
}

/** @type {Record<number, { action: string, content: string, channel: string }>} */
const WEEK_TEMPLATES = {
  4: {
    action: 'Teaser announcement',
    content: 'Share a save-the-date post highlighting the main offer or event theme.',
    channel: 'social',
  },
  3: {
    action: 'Product spotlight',
    content: 'Feature key products or packages from the document with prices.',
    channel: 'mini_website',
  },
  2: {
    action: 'Urgency push',
    content: 'Remind audience of the deadline; include venue/date and a clear CTA.',
    channel: 'email',
  },
  1: {
    action: 'Last chance',
    content: 'Final countdown creative — limited-time wording from the flyer.',
    channel: 'social',
  },
  0: {
    action: 'Event day',
    content: 'Live update / on-site promo post; thank early responders.',
    channel: 'signage',
  },
};

/**
 * @param {Array<object>} products
 * @param {Array<object>} events
 * @param {Array<object>} offers
 * @returns {Date | null}
 */
function earliestDeadline(products, events, offers) {
  /** @type {Date[]} */
  const dates = [];
  for (const p of products) {
    const d = parseEventDate(p?.deadline || p?.dates);
    if (d) dates.push(d);
  }
  for (const ev of events) {
    const d = parseEventDate(ev?.date);
    if (d) dates.push(d);
  }
  for (const offer of offers) {
    const d = parseEventDate(offer.eventDate || offer.endsAt || offer.startsAt);
    if (d) dates.push(d);
  }
  if (!dates.length) return null;
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates[0];
}

/**
 * @param {object} data
 * @param {string} businessName
 */
function campaignObjectiveLabel(data, businessName) {
  const campaign = data?.campaign && typeof data.campaign === 'object' ? data.campaign : null;
  const fromCampaign = String(campaign?.name ?? '').trim();
  if (fromCampaign) return fromCampaign;
  const fromList = Array.isArray(data?.campaigns) ? String(data.campaigns[0]?.name ?? '').trim() : '';
  if (fromList) return fromList;
  if (businessName) return businessName;
  return 'Document campaign';
}

/**
 * @param {object} params
 */
function buildCampaignPlanRecord({
  tenantKey,
  storeId,
  missionId,
  data,
  businessName,
  productIds,
  calendar,
  earliestEnd,
}) {
  const campaign = data?.campaign && typeof data.campaign === 'object' ? data.campaign : null;
  const label = campaignObjectiveLabel(data, businessName);

  return {
    tenantKey,
    storeId,
    missionId: missionId ?? undefined,
    objective: `${label} — DocumentIngestionSkill`,
    target: {
      products: productIds,
      business: data?.business?.name ?? businessName ?? null,
      campaign: campaign ?? (Array.isArray(data?.campaigns) && data.campaigns[0] ? data.campaigns[0] : null),
      source: 'document_ingestion',
    },
    timeWindow: {
      start: new Date().toISOString(),
      end: earliestEnd ? earliestEnd.toISOString() : null,
      tz: 'Australia/Melbourne',
    },
    channelsRequested: calendar,
    status: 'draft',
  };
}

/**
 * @param {Array<object>} events
 * @param {Array<object>} offers
 */
function collectEventDates(events, offers) {
  /** @type {Array<{ name: string, date: Date, venue?: string }>} */
  const out = [];
  const seen = new Set();

  for (const ev of events) {
    const name = String(ev?.name ?? '').trim();
    const date = parseEventDate(ev?.date);
    if (!name || !date) continue;
    const key = `${name}:${date.toISOString().slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, date, venue: ev?.venue ? String(ev.venue) : undefined });
  }

  for (const offer of offers) {
    const name = String(offer?.title ?? '').trim();
    const date = parseEventDate(offer.eventDate || offer.endsAt);
    if (!name || !date) continue;
    const key = `${name}:${date.toISOString().slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, date, venue: offer?.venue ? String(offer.venue) : undefined });
  }

  return out;
}

/**
 * @param {Array<object>} calendar
 * @param {Date | null} anchor
 */
function enrichCalendarWithDates(calendar, anchor) {
  if (!anchor) {
    return calendar.map((entry) => ({
      ...entry,
      scheduledDate: entry.scheduledDate ?? null,
    }));
  }

  return calendar.map((entry) => {
    const weeksBefore = parseWeeksBefore(entry.week);
    const scheduledDate =
      weeksBefore != null
        ? scheduledDateFromWeeksBefore(anchor, weeksBefore)
        : entry.scheduledDate ?? null;
    return { ...entry, scheduledDate };
  });
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const extracted = input?.extracted === true;
  const data = input?.data && typeof input.data === 'object' ? input.data : null;
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const tenantKey =
    (typeof context?.tenantKey === 'string' && context.tenantKey.trim()) ||
    (typeof input?.tenantKey === 'string' && input.tenantKey.trim()) ||
    storeId;
  const missionId =
    (typeof context?.missionId === 'string' && context.missionId.trim()) ||
    (typeof input?.missionId === 'string' && input.missionId.trim()) ||
    null;
  const productIds = Array.isArray(input?.productIds) ? input.productIds.filter(Boolean) : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const offers = Array.isArray(data?.offers) ? data.offers : [];
  const products = Array.isArray(data?.products) ? data.products : [];
  const businessName = String(data?.businessName ?? input?.businessName ?? '').trim();
  const anchor = earliestDeadline(products, events, offers);

  if (!extracted || !data) {
    return {
      status: 'ok',
      output: {
        planReady: false,
        reason: 'No extracted document data for campaign planning',
        calendar: [],
        weeks: [],
      },
    };
  }

  /** @type {Array<object>} */
  let calendar = [];

  if (Array.isArray(data.calendar) && data.calendar.length) {
    calendar = data.calendar.map((entry) => ({
      week: String(entry?.week ?? ''),
      action: String(entry?.action ?? ''),
      content: String(entry?.content ?? ''),
      channel: String(entry?.channel ?? 'social'),
    }));
    calendar = enrichCalendarWithDates(calendar, anchor);
  } else {
    const eventDates = collectEventDates(events, offers);
    const deadlineAnchor = anchor ?? eventDates[0]?.date ?? null;
    if (!deadlineAnchor && !eventDates.length) {
      return {
        status: 'ok',
        output: {
          planReady: false,
          reason: 'No event dates or calendar entries found in document',
          calendar: [],
          weeks: [],
        },
      };
    }

    const datesToPlan = eventDates.length
      ? eventDates
      : [{ name: businessName || 'Campaign', date: deadlineAnchor, venue: undefined }];

    for (const ev of datesToPlan) {
      const evAnchor = ev.date;
      for (const weeksBefore of [4, 3, 2, 1, 0]) {
        const tpl = WEEK_TEMPLATES[weeksBefore];
        calendar.push({
          week: weekLabel(evAnchor, weeksBefore),
          action: tpl.action,
          content: `${tpl.content}${businessName ? ` (${businessName}` : ''}${ev.venue ? ` @ ${ev.venue}` : ''}${businessName || ev.venue ? ')' : ''} — ${ev.name}`,
          channel: tpl.channel,
          eventName: ev.name,
          eventDate: evAnchor.toISOString().slice(0, 10),
          scheduledDate: scheduledDateFromWeeksBefore(evAnchor, weeksBefore),
        });
      }
    }
  }

  /** @type {string | null} */
  let planId = null;
  /** @type {boolean} */
  let planPersisted = false;
  /** @type {string | null} */
  let persistError = null;

  if (storeId && tenantKey) {
    try {
      const prisma = getPrismaClient();
      const planData = buildCampaignPlanRecord({
        tenantKey,
        storeId,
        missionId,
        data,
        businessName,
        productIds,
        calendar,
        earliestEnd: anchor,
      });
      const plan = await prisma.campaignPlan.create({ data: planData });
      planId = plan.id;
      planPersisted = true;
    } catch (err) {
      persistError = err?.message ?? String(err);
      console.warn('[suggest_campaign_plan] CampaignPlan persistence failed:', persistError);
    }
  }

  let screensQueued = 0;
  let displayQueuePlanned = false;
  if (storeId && calendar.length > 0) {
    try {
      const prismaForScreens = getPrismaClient();
      const signagePlaylists = await prismaForScreens.playlist.findMany({
        where: { storeId, active: true, type: 'SIGNAGE' },
        select: { id: true, name: true },
        take: 10,
      });
      if (signagePlaylists.length > 0) {
        screensQueued = signagePlaylists.length;
        displayQueuePlanned = true;
        if (missionId) {
          await appendEvent(missionId, 'document_ingestion.display_queue', {
            storeId,
            skill: 'smart_display_publish',
            content: calendar[0],
            playlistIds: signagePlaylists.map((p) => p.id),
            source: 'document_ingestion_calendar',
          }).catch(() => {});
        }
      }
    } catch (screenErr) {
      console.warn('[suggest_campaign_plan] display queue skipped:', screenErr?.message ?? screenErr);
    }
  }

  return {
    status: 'ok',
    output: {
      planReady: true,
      planId,
      planPersisted,
      persistError,
      persistTarget: 'CampaignPlan',
      eventCount: collectEventDates(events, offers).length || (anchor ? 1 : 0),
      calendar,
      weeks: calendar,
      screensQueued,
      displayQueuePlanned,
      executionPlan: {
        summary: `${calendar.length} scheduled actions`,
        nextAction: calendar[0] ?? null,
      },
      message: `Campaign plan: ${calendar.length} actions`,
    },
  };
}

export { buildCampaignPlanRecord };
export default execute;
