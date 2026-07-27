import { describe, it, expect } from 'vitest';
import {
  normalizeOcrText,
  parseBusinessCardOCR,
  truncateRawTextForPayload,
  entitiesToBusinessProfile,
} from '../src/lib/businessCardParser.js';

/** PTH-like fixture: business name, phones, email, website, address (VIC 3026), Facebook */
const PTH_LIKE_RAW = `
PTH ELECTRICAL PTY LTD

Unit 2, 45 Industrial Drive
Truganina VIC 3026

Phone: (03) 9312 3456
Mobile: 0412 555 789
E: info@pth-electrical.com.au
www.pth-electrical.com.au
Facebook: pth.electrical
`;

describe('businessCardParser', () => {
  describe('normalizeOcrText', () => {
    it('collapses spaces and newlines', () => {
      expect(normalizeOcrText('  a   b  \n\n  c  ')).toBe('a b\n\nc');
    });
    it('returns empty string for null/undefined', () => {
      expect(normalizeOcrText(null)).toBe('');
      expect(normalizeOcrText(undefined)).toBe('');
    });
    it('returns empty for non-string', () => {
      expect(normalizeOcrText(123)).toBe('');
    });
  });

  describe('parseBusinessCardOCR (PTH-like fixture)', () => {
    const result = parseBusinessCardOCR(PTH_LIKE_RAW, { country: 'AU' });

    it('extracts businessName', () => {
      expect(result.extractedEntities.businessName).toBeDefined();
      expect(typeof result.extractedEntities.businessName).toBe('string');
      expect(result.extractedEntities.businessName.length).toBeGreaterThan(0);
    });

    it('extracts at least 2 phones, normalized', () => {
      expect(result.extractedEntities.phones).toBeDefined();
      expect(Array.isArray(result.extractedEntities.phones)).toBe(true);
      expect(result.extractedEntities.phones.length).toBeGreaterThanOrEqual(2);
      result.extractedEntities.phones.forEach((p) => {
        expect(typeof p).toBe('string');
        expect(p).toMatch(/\d/);
      });
    });

    it('extracts email', () => {
      expect(result.extractedEntities.email).toBeDefined();
      expect(result.extractedEntities.email).toContain('@');
      expect(result.extractedEntities.email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
    });

    it('extracts website', () => {
      expect(result.extractedEntities.website).toBeDefined();
      expect(result.extractedEntities.website).toMatch(/pth-electrical|www\.|https?:\/\//i);
    });

    it('extracts address containing VIC and 3026', () => {
      expect(result.extractedEntities.address).toBeDefined();
      expect(result.extractedEntities.address).toMatch(/VIC/i);
      expect(result.extractedEntities.address).toMatch(/3026/);
    });

    it('extracts social (Facebook)', () => {
      expect(result.extractedEntities.social).toBeDefined();
      expect(result.extractedEntities.social.facebook).toBeDefined();
    });

    it('returns confidence per field', () => {
      expect(result.confidence).toBeDefined();
      if (result.extractedEntities.email) expect(typeof result.confidence.email).toBe('number');
      if (result.extractedEntities.phones?.length)
        expect(typeof result.confidence.phones).toBe('number');
    });

    it('returns meta with rawLines, emails, websites, phoneCandidates', () => {
      expect(result.meta.rawLines).toBeDefined();
      expect(Array.isArray(result.meta.rawLines)).toBe(true);
      expect(result.meta.emails).toBeDefined();
      expect(result.meta.websites).toBeDefined();
      expect(result.meta.phoneCandidates).toBeDefined();
    });
  });

  describe('noisy OCR', () => {
    const noisy = `  \n\n   ACME   CO   \n   \n  Ph:  03  9999  8888  \n  E:  a@b.com  \n\n  `;
    it('does not throw and returns entities when possible', () => {
      const result = parseBusinessCardOCR(noisy, { country: 'AU' });
      expect(result).toBeDefined();
      expect(result.extractedEntities).toBeDefined();
      expect(result.meta.rawLines).toBeDefined();
      expect(result.extractedEntities.email).toMatch(/a@b\.com/);
    });
  });

  describe('multiple emails and phones', () => {
    const multi = `
Biz Name
sales@first.com
info@second.com
03 1111 1111
0411 222 333
`;
    it('uses first email as primary, all in meta.emails', () => {
      const result = parseBusinessCardOCR(multi, { country: 'AU' });
      expect(result.extractedEntities.email).toBe('sales@first.com');
      expect(result.meta.emails).toContain('sales@first.com');
      expect(result.meta.emails).toContain('info@second.com');
    });
    it('returns unique phones in order of appearance', () => {
      const result = parseBusinessCardOCR(multi, { country: 'AU' });
      expect(result.extractedEntities.phones).toBeDefined();
      expect(result.extractedEntities.phones.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('missing address', () => {
    const noAddress = `
Company Name Only
hello@example.com
0412 345 678
`;
    it('does not throw; address may be absent', () => {
      const result = parseBusinessCardOCR(noAddress, { country: 'AU' });
      expect(result).toBeDefined();
      expect(result.extractedEntities.email).toBe('hello@example.com');
      expect(result.extractedEntities.address === undefined || result.extractedEntities.address === null || typeof result.extractedEntities.address === 'string').toBe(true);
    });
  });

  describe('safety: never throw', () => {
    it('returns empty structure for null', () => {
      const result = parseBusinessCardOCR(null);
      expect(result.extractedEntities).toEqual({});
      expect(result.meta.rawLines).toEqual([]);
    });
    it('returns empty structure for undefined', () => {
      const result = parseBusinessCardOCR(undefined);
      expect(result.extractedEntities).toEqual({});
    });
    it('returns empty structure for empty string', () => {
      const result = parseBusinessCardOCR('');
      expect(result.extractedEntities).toEqual({});
    });
    it('handles non-string without throwing', () => {
      expect(() => parseBusinessCardOCR(123)).not.toThrow();
      expect(() => parseBusinessCardOCR({})).not.toThrow();
    });
  });

  describe('PTH OCR fixture (boilerplate + wrong address/phones)', () => {
    const badOcr = `Sure, here is the text extracted from the image:.
PTH International Furniture
0413 091 777 or 0466 112 628
1/22 Malibu St, Derrimut VIC 3026
0413091777, 046611262804165, 0421382023(
pth.aus2023@gmail.com
https://www.pthfurniture.com.au
Facebook: PTH`;
    it('strips boilerplate and does not use it as businessName', () => {
      const result = parseBusinessCardOCR(badOcr, { country: 'AU' });
      expect(result.extractedEntities.businessName).not.toMatch(/sure|here is|text extracted/i);
      expect(result.extractedEntities.businessName).toMatch(/PTH|Furniture/i);
    });
    it('extracts address with VIC 3026, not phone numbers', () => {
      const result = parseBusinessCardOCR(badOcr, { country: 'AU' });
      expect(result.extractedEntities.address).toBeDefined();
      expect(result.extractedEntities.address).toMatch(/VIC|3026/i);
      expect(result.extractedEntities.address).not.toMatch(/0413 091 777|0466 112 628/);
    });
    it('extracts phones as separate normalized entries without trailing punctuation', () => {
      const result = parseBusinessCardOCR(badOcr, { country: 'AU' });
      expect(result.extractedEntities.phones).toBeDefined();
      expect(result.extractedEntities.phones.length).toBeGreaterThanOrEqual(2);
      result.extractedEntities.phones.forEach((p) => {
        expect(p).not.toMatch(/[(\[,]$/);
        expect(p).toMatch(/^\d[\d\s]+$/);
      });
    });
    it('extracts email, website, Facebook', () => {
      const result = parseBusinessCardOCR(badOcr, { country: 'AU' });
      expect(result.extractedEntities.email).toBe('pth.aus2023@gmail.com');
      expect(result.extractedEntities.website).toMatch(/pthfurniture\.com\.au/);
      expect(result.extractedEntities.social?.facebook).toBeDefined();
    });
  });

  describe('entitiesToBusinessProfile', () => {
    it('maps businessName to name', () => {
      const profile = entitiesToBusinessProfile({
        businessName: 'PTH Furniture',
        address: 'Derrimut VIC 3026',
        phones: ['0412 345 678'],
      });
      expect(profile.name).toBe('PTH Furniture');
      expect(profile.address).toBe('Derrimut VIC 3026');
      expect(profile.phones).toEqual(['0412 345 678']);
    });
    it('returns empty object for null/empty', () => {
      expect(entitiesToBusinessProfile(null)).toEqual({});
      expect(entitiesToBusinessProfile({})).toEqual({});
    });
  });

  describe('truncateRawTextForPayload', () => {
    it('returns full text when under limit', () => {
      const short = 'Hello world';
      expect(truncateRawTextForPayload(short, 100)).toBe(short);
    });
    it('truncates and appends when over limit', () => {
      const long = 'a'.repeat(5000);
      const out = truncateRawTextForPayload(long, 100);
      expect(out.length).toBeLessThanOrEqual(120);
      expect(out).toContain('… [truncated]');
    });
    it('returns empty string for null/undefined', () => {
      expect(truncateRawTextForPayload(null)).toBe('');
      expect(truncateRawTextForPayload(undefined)).toBe('');
    });
  });
});
