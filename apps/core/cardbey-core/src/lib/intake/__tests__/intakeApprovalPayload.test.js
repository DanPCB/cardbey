import { describe, expect, it } from 'vitest';
import { buildApprovalPayload, formatParametersForDisplay } from '../intakeApprovalPayload.js';

describe('buildApprovalPayload', () => {
  it('returns preview shape with human title and requiresConfirmation', () => {
    const p = buildApprovalPayload({
      tool: 'orders_report',
      parameters: { storeId: 's1', groupBy: 'day' },
      context: { locale: 'en', userMessage: 'Show sales' },
    });
    expect(p.previewId).toBeTruthy();
    expect(p.title).toBeTruthy();
    expect(p.summary).toContain('Confirm');
    expect(Array.isArray(p.impact)).toBe(true);
    expect(p.impact.length).toBeGreaterThan(0);
    expect(p.requiresConfirmation).toBe(true);
    expect(p.parameters.Store).toBe('s1');
    expect(p.parameters['Group by']).toBe('day');
  });

  it('formats booleans and arrays for display without raw objects', () => {
    const d = formatParametersForDisplay('signage.publish-to-devices', {
      pushToAll: true,
      deviceIds: ['a', 'b'],
    });
    expect(d['Push to all screens']).toBe('Yes');
    expect(d['Target devices']).toMatch(/item/);
  });
});
