import { describe, expect, it } from 'vitest';
import { fallbackExtract } from '../entityExtractor.js';

describe('entityExtractor fallbackExtract', () => {
  it('extracts name, email, and phone from business card text', () => {
    const text = `Acme Cafe
123 Main Street
hello@acme.com
+61 412 345 678`;

    const result = fallbackExtract(text, 'business_card');
    expect(result.name).toBeTruthy();
    expect(result.email).toBe('hello@acme.com');
    expect(result.phone).toMatch(/412/);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns null name for empty text', () => {
    const result = fallbackExtract('', 'business_card');
    expect(result.name).toBeNull();
  });
});
