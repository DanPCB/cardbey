import { describe, expect, it } from 'vitest';
import {
  sanitizeStoreSlogan,
  isCustomerFacingSlogan,
  normalizeAndValidateSlogan,
  looksLikeSloganMeta,
} from './sanitizeStoreSlogan.js';

describe('sanitizeStoreSlogan', () => {
  it('strips slogan tips and returns the first numbered sample only', () => {
    expect(
      sanitizeStoreSlogan(
        'Here are some professional slogans for your Food & drink business: 1. **"Where every bite tells a story"** 2. "Fresh flavors daily"',
      ),
    ).toBe('Where every bite tells a story');
  });

  it('strips Anison Capital production wrapper', () => {
    expect(
      sanitizeStoreSlogan(
        'A professional slogan for ANISON CAPITAL GROUP: "Building Better Futures"',
      ),
    ).toBe('Building Better Futures');
  });

  it('strips Top Pick markdown wrapper (BB Flowers)', () => {
    expect(
      sanitizeStoreSlogan('Top Pick: *"Bringing Nature\'s Beauty Into Every Moment"*'),
    ).toBe("Bringing Nature's Beauty Into Every Moment");
  });

  it('strips Here is your slogan prefix', () => {
    expect(
      sanitizeStoreSlogan('Here is your slogan: Trusted Advice for Every Opportunity'),
    ).toBe('Trusted Advice for Every Opportunity');
  });

  it('leaves clean slogans unchanged', () => {
    expect(sanitizeStoreSlogan('Trusted Advice for Every Opportunity')).toBe(
      'Trusted Advice for Every Opportunity',
    );
    expect(sanitizeStoreSlogan('Building Confidence in Every Decision')).toBe(
      'Building Confidence in Every Decision',
    );
  });

  it('normalizeAndValidateSlogan marks production wrappers as repaired', () => {
    const r = normalizeAndValidateSlogan(
      'A professional slogan for ANISON CAPITAL GROUP:\n"Building Confidence in Every Decision"',
    );
    expect(r.valid).toBe(true);
    expect(r.repaired).toBe(true);
    expect(r.slogan).toBe('Building Confidence in Every Decision');
  });

  it('detects meta language before sanitize', () => {
    expect(looksLikeSloganMeta('Top Pick: something')).toBe(true);
    expect(looksLikeSloganMeta('Building Tomorrow\'s Wealth')).toBe(false);
  });

  it('isCustomerFacingSlogan rejects wrappers', () => {
    expect(isCustomerFacingSlogan('A professional slogan for X: "Hi"')).toBe(false);
    expect(isCustomerFacingSlogan('Building Tomorrow\'s Wealth')).toBe(true);
  });
});
