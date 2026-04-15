/**
 * Tests for content ingest PII scrubber (scrubText).
 */
import { describe, it, expect } from 'vitest';
import { scrubText } from '../src/services/contentIngest/piiScrub.js';

describe('piiScrub', () => {
  it('scrubs email addresses', () => {
    expect(scrubText('Contact me at alice@example.com for info')).toBe('Contact me at [email] for info');
    expect(scrubText('Test.User+tag@sub.domain.co.uk')).toBe('[email]');
  });

  it('scrubs phone-like sequences', () => {
    expect(scrubText('Call 555-123-4567 or +1 (555) 987-6543')).toContain('[phone]');
    expect(scrubText('Phone: 01234567890')).toContain('[phone]');
  });

  it('scrubs URLs', () => {
    expect(scrubText('Visit https://example.com/path?q=1')).toBe('Visit [url]');
    expect(scrubText('See http://foo.bar')).toBe('See [url]');
  });

  it('scrubs simple street addresses', () => {
    const s = scrubText('We are at 123 Main Street. Open daily.');
    expect(s).toContain('[address]');
    expect(s).not.toContain('123 Main');
  });

  it('trims and truncates to maxLen', () => {
    expect(scrubText('  hello  ')).toBe('hello');
    const long = 'a'.repeat(1000);
    expect(scrubText(long, { maxLen: 100 }).length).toBeLessThanOrEqual(100);
    expect(scrubText(long, { maxLen: 800 }).length).toBeLessThanOrEqual(800);
  });

  it('returns empty string for null/undefined/non-string', () => {
    expect(scrubText(null)).toBe('');
    expect(scrubText(undefined)).toBe('');
    expect(scrubText(123)).toBe('');
  });
});
