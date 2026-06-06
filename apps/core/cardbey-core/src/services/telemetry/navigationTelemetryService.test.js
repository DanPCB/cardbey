import { describe, expect, it } from 'vitest';
import { parseNavigationTelemetryBody } from './navigationTelemetryService.js';

describe('navigationTelemetryService', () => {
  it('parses page.view payload', () => {
    const parsed = parseNavigationTelemetryBody({
      event: 'page.view',
      userId: 'u1',
      userRole: 'admin',
      fromPath: '/dashboard',
      toPath: '/catalog',
      sessionId: 'sess-1',
      ts: 1717000000000,
    });
    expect(parsed?.eventType).toBe('page.view');
    expect(parsed?.userRole).toBe('admin');
    expect(parsed?.clientTs).toBeInstanceOf(Date);
  });

  it('rejects unknown events', () => {
    expect(parseNavigationTelemetryBody({ event: 'nope' })).toBeNull();
  });
});
