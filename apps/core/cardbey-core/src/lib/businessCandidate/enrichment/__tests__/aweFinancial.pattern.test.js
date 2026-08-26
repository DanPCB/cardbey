/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  resolveCategoryFromSignals,
  resolveSubCategory,
} from '../../../../config/categoryTaxonomy.js';
import {
  extractAddress,
  extractEmail,
  extractPhone,
  isNavItem,
} from '../webExtractors.js';
import { evaluateServiceMismatchGuard } from '../../../../services/media/serviceImageMismatchGuards.js';
import { buildHeroSearchQueries } from '../heroSearchQueries.js';

describe('AWE Financial enrichment pattern', () => {
  it('resolves finance broker signals to Professional + Mortgage & Finance Broker', () => {
    expect(
      resolveCategoryFromSignals({
        businessName: 'AWE Financial',
        placesTypes: ['finance', 'financial_services'],
      }),
    ).toBe('Professional');

    expect(
      resolveSubCategory({
        category: 'Professional',
        businessName: 'AWE Financial',
        businessType: 'Finance Broker',
        placesTypes: ['finance'],
      }),
    ).toBe('Mortgage & Finance Broker');
  });

  it('does not steal finance broker into Insurance via bare broker alias', () => {
    expect(
      resolveSubCategory({
        category: 'Professional',
        businessName: 'Leo Nguyen Finance Broker',
        tags: ['mortgage', 'home loan'],
      }),
    ).toBe('Mortgage & Finance Broker');
  });

  it('extracts Australian address from footer', () => {
    const html = '<footer><p>238 Barkly St, Footscray VIC 3011</p></footer>';
    expect(extractAddress(html)).toMatch(/238 Barkly St,\s*Footscray VIC/);
  });

  it('extracts email from mailto href', () => {
    const html = '<a href="mailto:leo@awefinancial.com.au">Email</a>';
    expect(extractEmail(html)).toBe('leo@awefinancial.com.au');
  });

  it('extracts AU mobile phone without country code', () => {
    const html = '<p>Call 0420 435 238 today</p>';
    expect(extractPhone(html)).toMatch(/0420/);
  });

  it('rejects street sweeper imagery for Book our consultations', () => {
    const guard = evaluateServiceMismatchGuard(
      'Book our consultations',
      'street sweeper truck municipal road cleaning Footscray',
    );
    expect(guard.pass).toBe(false);
  });

  it('builds mortgage-broker hero ladder (not Other storefront)', () => {
    const queries = buildHeroSearchQueries({
      businessName: 'AWE Financial',
      suburb: 'Footscray',
      category: 'Professional',
      businessType: 'Finance Broker',
      tags: ['mortgage broker', 'home loan'],
    });
    const blob = queries.join(' ').toLowerCase();
    expect(blob).toMatch(/finance broker|mortgage broker|home loan|financial adviser/);
    expect(blob).not.toMatch(/other footscray storefront/);
  });

  it('keeps Book our consultations as a service label (not nav chrome)', () => {
    expect(isNavItem('Book our consultations')).toBe(false);
    expect(isNavItem('About')).toBe(true);
  });
});
