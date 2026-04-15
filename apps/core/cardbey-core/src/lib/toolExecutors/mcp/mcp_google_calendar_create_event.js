/**
 * MCP / Mission tool: create a Google Calendar event (external write).
 * Uses OAuthConnection platform "google"; optional pageId holds calendar id (default primary).
 */

import { buildGoogleCalendarEventBody } from '../../googleCalendar/buildGoogleCalendarEventBody.js';
import { resolveGoogleAccessTokenForUser } from '../../googleCalendar/resolveGoogleAccessToken.js';

const EVENTS_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

/** Matches OAuthConnection.pageId for Google link rows (Prisma unique), not a Calendar API id. */
const GOOGLE_OAUTH_PAGE_ID = 'google_calendar';

function encodeCalendarId(raw) {
  const s = typeof raw === 'string' && raw.trim() ? raw.trim() : 'primary';
  return encodeURIComponent(s);
}

function calendarIdForRequest(input, connection) {
  if (typeof input.calendarId === 'string' && input.calendarId.trim()) {
    return encodeCalendarId(input.calendarId.trim());
  }
  const pid = connection?.pageId != null ? String(connection.pageId).trim() : '';
  if (!pid || pid === GOOGLE_OAUTH_PAGE_ID) {
    return encodeCalendarId('primary');
  }
  return encodeCalendarId(pid);
}

/**
 * @param {object} [input]
 * @param {string} [input.summary]
 * @param {string} [input.startDateTime]
 * @param {string} [input.endDateTime]
 * @param {string} [input.timeZone]
 * @param {string} [input.description]
 * @param {string} [input.location]
 * @param {string} [input.calendarId] — overrides connection.pageId when set
 * @param {string} [input.sendUpdates] — none | all | externalOnly (default none)
 * @param {object} [context]
 * @param {string} [context.userId]
 */
export async function execute(input = {}, context = {}) {
  const userId = String(input.userId ?? context.userId ?? '').trim();
  if (!userId) {
    return { status: 'failed', error: { code: 'USER_ID_REQUIRED', message: 'userId is required' } };
  }

  const built = buildGoogleCalendarEventBody(input);
  if (!built.ok) {
    return { status: 'failed', error: built.error };
  }

  const tokenResult = await resolveGoogleAccessTokenForUser(userId);
  if (tokenResult.error) {
    return { status: 'blocked', blocker: { code: tokenResult.error.code, message: tokenResult.error.message } };
  }

  const { accessToken, connection } = tokenResult;
  const calendarId = calendarIdForRequest(input, connection);

  const su = typeof input.sendUpdates === 'string' ? input.sendUpdates.trim().toLowerCase().replace(/_/g, '') : 'none';
  const sendUpdates = su === 'all' ? 'all' : su === 'externalonly' ? 'externalOnly' : 'none';

  const url = `${EVENTS_BASE}/${calendarId}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(built.body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.error || `Calendar API HTTP ${res.status}`;
    return {
      status: 'failed',
      error: { code: 'GOOGLE_CALENDAR_API_ERROR', message: String(msg) },
    };
  }

  return {
    status: 'ok',
    output: {
      success: true,
      data: {
        id: data.id ?? null,
        htmlLink: data.htmlLink ?? null,
        status: data.status ?? null,
        summary: data.summary ?? built.body.summary,
        start: data.start ?? null,
        end: data.end ?? null,
      },
      metadata: {
        tool: 'mcp_google_calendar_create_event',
        calendarId: calendarId === encodeURIComponent('primary') ? 'primary' : decodeURIComponent(calendarId),
        sendUpdates,
      },
    },
  };
}
