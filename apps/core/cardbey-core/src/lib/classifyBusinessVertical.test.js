import { describe, expect, it } from 'vitest';
import { classifyBusinessVertical } from './classifyBusinessVertical.js';

describe('classifyBusinessVertical', () => {
  const cases = [
    {
      name: "Brunetti Carlton",
      input: { category: 'cafe', businessName: 'Brunetti Carlton' },
      vertical: 'food',
      commerceMode: 'menu',
      cta: 'Order now',
      feed: 'food',
    },
    {
      name: "Pellegrini's Espresso Bar",
      input: { category: 'cafe', businessName: "Pellegrini's Espresso Bar" },
      vertical: 'food',
      commerceMode: 'menu',
      cta: 'Order now',
      feed: 'food',
    },
    {
      name: 'Lune Croissanterie Fitzroy',
      input: { category: 'bakery', businessName: 'Lune Croissanterie Fitzroy' },
      vertical: 'food',
      commerceMode: 'menu',
      cta: 'Order now',
      feed: 'food',
    },
    {
      name: 'MC Hair Salon',
      input: { category: 'salon', businessName: 'MC Hair Salon' },
      vertical: 'beauty',
      commerceMode: 'bookings',
      cta: 'Book now',
      feed: 'services',
    },
    {
      name: 'TN nails & spa',
      input: { category: 'salon', businessName: 'TN nails & spa' },
      vertical: 'beauty',
      commerceMode: 'bookings',
      cta: 'Book now',
      feed: 'services',
    },
    {
      name: 'Beijingmassage',
      input: { category: 'spa', businessName: 'Beijingmassage' },
      vertical: 'beauty',
      commerceMode: 'bookings',
      cta: 'Book now',
      feed: 'services',
    },
    {
      name: 'AA Travel & Golf Tour',
      input: { category: 'travel', businessName: 'AA Travel & Golf Tour' },
      vertical: 'experience',
      commerceMode: 'enquiry',
      cta: 'Enquire now',
      feed: 'services',
      transactionMode: 'order',
    },
    {
      name: 'My Fashion',
      input: { category: 'retail', businessName: 'My Fashion' },
      vertical: 'retail',
      commerceMode: 'products',
      cta: 'Shop now',
      feed: 'products',
    },
    {
      name: 'Moc Vietnamese Restaurant',
      input: { category: 'restaurant', businessName: 'Moc Vietnamese Restaurant' },
      vertical: 'food',
      commerceMode: 'menu',
      cta: 'Order now',
      feed: 'food',
    },
    {
      name: 'Fitzroy Vet Hospital',
      input: { category: 'clinic', businessName: 'Fitzroy Vet Hospital' },
      vertical: 'health',
      commerceMode: 'bookings',
      cta: 'Book now',
      feed: 'services',
    },
    {
      name: 'My Bakery',
      input: { businessType: 'studio', businessName: 'My Bakery - Melbourne' },
      vertical: 'food',
      commerceMode: 'menu',
      cta: 'Order now',
      feed: 'food',
    },
    {
      name: 'BrayBrook Bakery',
      input: { businessType: 'Bakery', businessName: 'BrayBrook Bakery' },
      vertical: 'food',
      commerceMode: 'menu',
      cta: 'Order now',
      feed: 'food',
    },
  ];

  for (const row of cases) {
    it(`classifies ${row.name}`, () => {
      const result = classifyBusinessVertical(row.input);
      expect(result.businessVertical).toBe(row.vertical);
      expect(result.commerceMode).toBe(row.commerceMode);
      expect(result.ctaLabel).toBe(row.cta);
      expect(result.feedCategory).toBe(row.feed);
      expect(result.transactionMode).toBe(
        row.transactionMode ??
          (row.commerceMode === 'menu' || row.commerceMode === 'products' ? 'order' : 'booking'),
      );
    });
  }

  it('food beats generic studio type for bakery names', () => {
    const result = classifyBusinessVertical({
      businessType: 'studio',
      businessName: 'BrayBrook Bakery',
    });
    expect(result.businessVertical).toBe('food');
    expect(result.ctaLabel).toBe('Order now');
  });
});
