// DANH: skill-round6-document
/**
 * suggest_campaign_plan — week-by-week content calendar leading up to event dates.
 */

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
 * @param {object} [input]
 */
export async function execute(input = {}) {
  // @pure-transform: deterministic campaign calendar from extracted doc; no DB/API side effects.
  const extracted = input?.extracted === true;
  const data = input?.data && typeof input.data === 'object' ? input.data : null;
  const events = Array.isArray(data?.events) ? data.events : [];
  const offers = Array.isArray(data?.offers) ? data.offers : [];
  const businessName = String(data?.businessName ?? input?.businessName ?? '').trim();

  if (!extracted || !data) {
    return {
      status: 'ok',
      output: {
        planReady: false,
        reason: 'No extracted document data for campaign planning',
        calendar: [],
      },
    };
  }

  const eventDates = collectEventDates(events, offers);
  if (!eventDates.length) {
    return {
      status: 'ok',
      output: {
        planReady: false,
        reason: 'No event dates found in document — add dates to generate a calendar',
        calendar: [],
      },
    };
  }

  /** @type {Array<{ week: string, action: string, content: string, channel: string, eventName: string, eventDate: string }>} */
  const calendar = [];

  for (const ev of eventDates) {
    for (const weeksBefore of [4, 3, 2, 1, 0]) {
      const tpl = WEEK_TEMPLATES[weeksBefore];
      calendar.push({
        week: weekLabel(ev.date, weeksBefore),
        action: tpl.action,
        content: `${tpl.content}${businessName ? ` (${businessName}` : ''}${ev.venue ? ` @ ${ev.venue}` : ''}${businessName || ev.venue ? ')' : ''} — ${ev.name}`,
        channel: tpl.channel,
        eventName: ev.name,
        eventDate: ev.date.toISOString().slice(0, 10),
      });
    }
  }

  return {
    status: 'ok',
    output: {
      planReady: true,
      eventCount: eventDates.length,
      calendar,
      executionPlan: {
        summary: `${calendar.length} scheduled actions across ${eventDates.length} event(s)`,
        nextAction: calendar[0] ?? null,
      },
      message: `Campaign plan: ${calendar.length} actions over ${eventDates.length} event(s)`,
    },
  };
}

export default execute;
