/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPiiRedactionEnabled,
  redactChatMessages,
  redactPII,
} from '../redactionMiddleware.ts';

describe('redactionMiddleware', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ENABLE_PII_REDACTION;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults PII redaction to on', () => {
    delete process.env.ENABLE_PII_REDACTION;
    expect(isPiiRedactionEnabled()).toBe(true);
  });

  it('allows ENABLE_PII_REDACTION=false rollback', () => {
    process.env.ENABLE_PII_REDACTION = 'false';
    expect(isPiiRedactionEnabled()).toBe(false);
    expect(redactPII('test@example.com')).toBe('test@example.com');
  });

  it('redacts emails', () => {
    const input = 'Contact us at support@cardbey.com or help@example.com';
    const output = redactPII(input);
    expect(output).not.toContain('support@cardbey.com');
    expect(output).not.toContain('help@example.com');
    expect(output).toContain('[EMAIL_REDACTED]');
  });

  it('redacts Australian phone numbers', () => {
    const input = 'Call 0412345678 or +61412345678';
    const output = /** @type {string} */ (redactPII(input));
    expect(output).not.toContain('0412345678');
    expect(output).not.toContain('+61412345678');
    expect(output).toContain('[PHONE_REDACTED]');
  });

  it('redacts addresses', () => {
    const input = '123 Main Street, Sydney. 456 Queen St, Melbourne.';
    const output = /** @type {string} */ (redactPII(input));
    expect(output).not.toContain('123 Main Street');
    expect(output).not.toContain('456 Queen St');
    expect(output).toContain('[ADDRESS_REDACTED]');
  });

  it('redacts credit card numbers', () => {
    const input = 'Card: 4111-1111-1111-1111 or 4111 1111 1111 1111';
    const output = /** @type {string} */ (redactPII(input));
    expect(output).not.toContain('4111-1111-1111-1111');
    expect(output).not.toContain('4111 1111 1111 1111');
    expect(output).toContain('[CARD_REDACTED]');
  });

  it('handles objects recursively', () => {
    const input = {
      user: {
        email: 'test@example.com',
        message: 'Call 0412345678',
      },
      metadata: { safe: 'unchanged' },
    };
    const output = /** @type {typeof input} */ (redactPII(input));
    expect(output.user.email).toBe('[EMAIL_REDACTED]');
    expect(output.user.message).toContain('[PHONE_REDACTED]');
    expect(output.metadata.safe).toBe('unchanged');
  });

  it('logs redaction activity', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    redactPII('test@example.com');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[REDACTION]',
      expect.objectContaining({ redactionCount: 1 }),
    );
  });

  it('redacts chat message content', () => {
    const messages = redactChatMessages([
      { role: 'system', content: 'Store email owner@biz.com' },
      { role: 'user', content: 'My number is 0412345678' },
    ]);
    expect(messages[0].content).toContain('[EMAIL_REDACTED]');
    expect(messages[1].content).toContain('[PHONE_REDACTED]');
  });
});
