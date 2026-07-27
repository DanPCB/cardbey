import { describe, it, expect } from 'vitest';
import { normalizeDocumentExtraction } from './documentVisionExtract.js';

describe('normalizeDocumentExtraction address hygiene', () => {
  it('leaves contact address null when absent from extraction', () => {
    const out = normalizeDocumentExtraction({
      businessName: 'Flyer Shop',
      contacts: [{ phone: '0400000000', email: '', website: '', address: '', role: '' }],
      products: [],
    });
    expect(out.contacts[0].address).toBeNull();
  });

  it('preserves explicit address from extraction', () => {
    const out = normalizeDocumentExtraction({
      businessName: 'BrayBrook Bakery',
      contacts: [{ address: '12 Main Rd, Braybrook VIC 3019' }],
      products: [],
    });
    expect(out.contacts[0].address).toBe('12 Main Rd, Braybrook VIC 3019');
  });
});
