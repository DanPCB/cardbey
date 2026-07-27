import { describe, it, expect } from 'vitest';
import {
  CA_HANDYMAN_CTX,
  IMAGE_MISMATCH_CASES,
  IMAGE_ACCEPT_CASES,
  buildCaHandymanTypedCatalog,
  evaluateCandidateRejection,
  buildQaMismatchDraft,
  runSemanticCatalogQa,
  assertCatalogKindConsistency,
} from './fixtures/caHandymanRegression.fixture.js';
import { resolveCommerceProfile } from '../../commerce/resolveCommerceProfile.js';
import { canonicalizeServiceName, isMalformedServiceTitle } from '../canonicalServiceNormalizer.js';
import { CatalogContractViolation } from '../../commerce/CatalogContractViolation.js';

describe('CA Handyman regression', () => {
  it('classifies CA Handyman as service business', () => {
    const profile = resolveCommerceProfile(CA_HANDYMAN_CTX);
    expect(profile.businessKind).toBe('service');
    expect(profile.catalogKind).toBe('service');
    expect(profile.transactionMode).not.toBe('checkout');
    expect(profile.currencyCode).toBe('AUD');
  });

  it('builds typed service catalog with zero productCount', () => {
    const catalog = buildCaHandymanTypedCatalog();
    expect(catalog.catalogKind).toBe('service');
    expect(catalog.counts.serviceCount).toBeGreaterThan(0);
    expect(catalog.counts.productCount).toBe(0);
    for (const item of catalog.catalogItems) {
      if (item.recordType === 'conversion_action') continue;
      expect(item.itemKind).toBe('service');
      expect(item.sku).toBeUndefined();
      expect(item.inventory).toBeUndefined();
    }
  });

  it('does not emit Chef suffix malformed titles', () => {
    const catalog = buildCaHandymanTypedCatalog();
    for (const item of catalog.catalogItems) {
      expect(isMalformedServiceTitle(item.name)).toBe(false);
      expect(item.name).not.toMatch(/-\s*Chef'?s/i);
    }
    const normalized = canonicalizeServiceName('Door Repair- Chef\'s');
    expect(normalized.canonicalName).toBe('Door Repair');
  });

  it('uses quote_required when blueprint prices are not evidence-backed', () => {
    const catalog = buildCaHandymanTypedCatalog();
    const door = catalog.catalogItems.find((i) => i.name === 'Door Repair');
    expect(door?.priceMode).toBe('quote_required');
    expect(door?.price).toBeUndefined();
  });

  it('rejects known semantic image mismatches', () => {
    for (const { service, candidateText, reject } of IMAGE_MISMATCH_CASES) {
      const result = evaluateCandidateRejection(service, candidateText);
      expect(result.rejected).toBe(reject);
    }
  });

  it('accepts valid semantic image matches', () => {
    for (const { service, candidateText, reject } of IMAGE_ACCEPT_CASES) {
      const result = evaluateCandidateRejection(service, candidateText);
      expect(result.rejected).toBe(reject);
    }
  });

  it('QA fails when 25 URLs have semantic mismatches', () => {
    const draft = buildQaMismatchDraft();
    const qa = runSemanticCatalogQa(draft);
    expect(qa.totalItems).toBeGreaterThan(0);
    expect(qa.score).not.toBe(100);
    expect(qa.catalogPass).toBe(false);
    expect(qa.rejectedImageMatches).toBeGreaterThan(0);
  });

  it('throws on service profile with product items when strict', () => {
    const profile = resolveCommerceProfile(CA_HANDYMAN_CTX);
    expect(() =>
      assertCatalogKindConsistency({
        businessCommerceProfile: profile,
        catalogItems: [{ name: 'Widget', itemKind: 'product', price: 10 }],
        strict: true,
      }),
    ).toThrow(CatalogContractViolation);
  });
});
