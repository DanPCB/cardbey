import { describe, it, expect } from 'vitest';
import {
  parseAuditEntry,
  sanitizeAuditFields,
  checkAuditRateLimit,
  evaluateAuditAlerts,
} from '../performerAuditService.js';

describe('performerAuditService', () => {
  it('sanitizes phone/website from fields', () => {
    const cleaned = sanitizeAuditFields({
      businessName: 'PTH',
      phone: '0400000000',
      website: 'https://example.com',
      location: 'Derrimut',
    });
    expect(cleaned.businessName).toBe('PTH');
    expect(cleaned.location).toBe('Derrimut');
    expect(cleaned.phone).toBeUndefined();
    expect(cleaned.website).toBeUndefined();
  });

  it('parses a valid audit entry', () => {
    const parsed = parseAuditEntry({
      sessionId: 'sess-1',
      step: 'validation',
      imageHash: 'abc123',
      understandingId: 'u1',
      source: 'ocr',
      confidence: 82,
      fields: { businessName: 'PTH', phone: '1' },
      validationResult: { valid: true, errors: [], warnings: [] },
      metadata: { environment: 'test', latencyMs: 12 },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.data.fields.phone).toBeUndefined();
    expect(parsed.data.confidence).toBe(82);
    expect(parsed.data.environment).toBe('test');
  });

  it('rejects invalid step', () => {
    const parsed = parseAuditEntry({ sessionId: 's', step: 'nope', imageHash: 'h' });
    expect(parsed.ok).toBe(false);
  });

  it('rate limits after burst', () => {
    const session = `rate-${Date.now()}`;
    let allowed = 0;
    for (let i = 0; i < 120; i++) {
      if (checkAuditRateLimit(session)) allowed += 1;
    }
    expect(allowed).toBe(100);
    expect(checkAuditRateLimit(session)).toBe(false);
  });

  it('evaluates alert thresholds', () => {
    const critical = evaluateAuditAlerts({
      successRate: 50,
      avgConfidence: 40,
      errorRate: 20,
      retryRate: 0,
    });
    expect(critical.some((a) => a.severity === 'critical')).toBe(true);
    const ok = evaluateAuditAlerts({
      successRate: 90,
      avgConfidence: 80,
      errorRate: 2,
      retryRate: 1,
    });
    expect(ok).toHaveLength(0);
  });
});
