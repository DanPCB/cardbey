import { describe, it, expect } from 'vitest';
import { buildGoogleCalendarEventBody } from './buildGoogleCalendarEventBody.js';

describe('buildGoogleCalendarEventBody', () => {
  it('requires summary, start, end', () => {
    expect(buildGoogleCalendarEventBody({}).ok).toBe(false);
    expect(buildGoogleCalendarEventBody({ summary: 'x' }).ok).toBe(false);
    expect(
      buildGoogleCalendarEventBody({ summary: 'x', startDateTime: '2026-04-08T10:00:00Z' }).ok,
    ).toBe(false);
  });

  it('builds event with optional timeZone', () => {
    const r = buildGoogleCalendarEventBody({
      summary: 'Team sync',
      startDateTime: '2026-04-08T10:00:00',
      endDateTime: '2026-04-08T11:00:00',
      timeZone: 'Australia/Sydney',
      description: 'Notes',
    });
    expect(r.ok).toBe(true);
    expect(r.body).toMatchObject({
      summary: 'Team sync',
      description: 'Notes',
      start: { dateTime: '2026-04-08T10:00:00', timeZone: 'Australia/Sydney' },
      end: { dateTime: '2026-04-08T11:00:00', timeZone: 'Australia/Sydney' },
    });
  });

  it('omits timeZone when not set', () => {
    const r = buildGoogleCalendarEventBody({
      summary: 'A',
      startDateTime: '2026-04-08T10:00:00Z',
      endDateTime: '2026-04-08T11:00:00Z',
    });
    expect(r.ok).toBe(true);
    expect(r.body.start).toEqual({ dateTime: '2026-04-08T10:00:00Z' });
    expect(r.body.end).toEqual({ dateTime: '2026-04-08T11:00:00Z' });
  });
});
