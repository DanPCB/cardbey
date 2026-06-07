import { describe, expect, it } from 'vitest';
import { coerceServiceCtaLabel } from './storeTransactionMode.js';

describe('coerceServiceCtaLabel', () => {
  it('does not treat order-mode Sports stores as booking', () => {
    expect(
      coerceServiceCtaLabel({
        businessType: 'Sports',
        transactionMode: 'order',
        ctaLabel: 'Book now',
      }),
    ).toBe('Order now');
  });

  it('defaults order-mode Sports stores to Order now', () => {
    expect(
      coerceServiceCtaLabel({
        businessType: 'Sports',
        transactionMode: 'order',
      }),
    ).toBe('Order now');
  });

  it('still books for explicit booking mode', () => {
    expect(
      coerceServiceCtaLabel({
        businessType: 'Sports',
        transactionMode: 'booking',
      }),
    ).toBe('Book now');
  });
});
