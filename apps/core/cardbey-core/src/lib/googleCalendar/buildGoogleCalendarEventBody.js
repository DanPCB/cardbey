/**
 * Build a Google Calendar API event resource from MCP / tool input.
 * @param {object} input
 * @param {string} [input.summary]
 * @param {string} [input.startDateTime] — ISO 8601
 * @param {string} [input.endDateTime] — ISO 8601
 * @param {string} [input.timeZone] — IANA tz when dateTime strings are local/wall-time
 * @param {string} [input.description]
 * @param {string} [input.location]
 * @returns {{ ok: true, body: object } | { ok: false, error: { code: string, message: string } }}
 */
export function buildGoogleCalendarEventBody(input = {}) {
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  const startDateTime = typeof input.startDateTime === 'string' ? input.startDateTime.trim() : '';
  const endDateTime = typeof input.endDateTime === 'string' ? input.endDateTime.trim() : '';

  if (!summary) {
    return { ok: false, error: { code: 'INVALID_INPUT', message: 'summary is required' } };
  }
  if (!startDateTime || !endDateTime) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'startDateTime and endDateTime are required (ISO 8601)' },
    };
  }

  const tz = typeof input.timeZone === 'string' && input.timeZone.trim() ? input.timeZone.trim() : null;
  const start = tz ? { dateTime: startDateTime, timeZone: tz } : { dateTime: startDateTime };
  const end = tz ? { dateTime: endDateTime, timeZone: tz } : { dateTime: endDateTime };

  /** @type {Record<string, unknown>} */
  const body = { summary, start, end };

  if (input.description != null && String(input.description).trim()) {
    body.description = String(input.description).slice(0, 8000);
  }
  if (input.location != null && String(input.location).trim()) {
    body.location = String(input.location).slice(0, 500);
  }

  return { ok: true, body };
}
