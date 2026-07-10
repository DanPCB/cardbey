import { describe, expect, it } from 'vitest';
import { resolveJourneyPaymentAmount, purposeForJourneyIntent, resolveBookingCartPaymentAmount } from '../paymentAmountResolver.js';

describe('paymentAmountResolver', () => {
  it('quote journey has no payment purpose', () => {
    expect(purposeForJourneyIntent('request_quote')).toBeNull();
  });

  it('inspection fee required when inspectionFee > 0', () => {
    const resolved = resolveJourneyPaymentAmount({
      purpose: 'inspection_fee',
      catalogItem: { name: 'On-site Measurement', inspectionFee: 85 },
    });
    expect(resolved.required).toBe(true);
    expect(resolved.amountCents).toBe(8500);
    expect(resolved.currency).toBe('AUD');
  });

  it('consultation with zero fee does not require payment', () => {
    const resolved = resolveJourneyPaymentAmount({
      purpose: 'consultation_fee',
      catalogItem: { name: 'Consultation', consultationFee: 0 },
    });
    expect(resolved.required).toBe(false);
  });

  it('fixed booking requires payment when price > 0 and fixed_booking mode', () => {
    const resolved = resolveJourneyPaymentAmount({
      purpose: 'booking_payment',
      catalogItem: { name: 'Express Service', price: 120, serviceMode: 'fixed_booking' },
    });
    expect(resolved.required).toBe(true);
    expect(resolved.amount).toBe(120);
  });

  it('booking cart sums payable services only', () => {
    const resolved = resolveBookingCartPaymentAmount([
      { name: 'Paid cut', price: 50, serviceMode: 'fixed_booking' },
      { name: 'Quote item', price: 200, serviceMode: 'quote_required' },
    ]);
    expect(resolved.required).toBe(true);
    expect(resolved.amount).toBe(50);
  });

  it('ignores client tampering — amount from catalog only', () => {
    const resolved = resolveJourneyPaymentAmount({
      purpose: 'booking_payment',
      catalogItem: { name: 'Express Service', price: 50, serviceMode: 'fixed_booking' },
      clientAmount: 1,
    });
    expect(resolved.amount).toBe(50);
  });

  it('quote request purpose not in resolver without valid purpose throws', () => {
    expect(() => resolveJourneyPaymentAmount({ purpose: 'invalid_purpose' })).toThrow();
  });
});
