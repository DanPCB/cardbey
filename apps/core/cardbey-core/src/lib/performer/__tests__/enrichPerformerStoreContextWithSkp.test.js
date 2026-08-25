import { describe, it, expect } from 'vitest';
import { enrichPerformerStoreContextWithSkp } from '../performerTurnWithLlm.js';
import { buildSKPFromSources } from '../../storeKnowledge/index.js';

describe('enrichPerformerStoreContextWithSkp', () => {
  const base = {
    storeId: 'biz_1',
    storeName: 'Thin Name',
    storeSlug: 'thin',
    businessType: 'Other',
    listedServices: [{ id: 's1', label: 'Install', bookable: true, hasListedPrice: false }],
    canSubmitEnquiry: true,
    canRequestBooking: true,
  };

  it('marks skpReady false when SKP is null', () => {
    const out = enrichPerformerStoreContextWithSkp(base, null);
    expect(out.skpReady).toBe(false);
    expect(out.storeName).toBe('Thin Name');
    expect(out.canonicalUrl).toBeUndefined();
  });

  it('merges SKP identity and visibility into Performer context', () => {
    const skp = buildSKPFromSources({
      business: {
        id: 'biz_1',
        slug: 'demo-cafe',
        name: 'Demo Cafe',
        description: 'Specialty coffee and light meals in Melbourne.',
        type: 'Cafe',
        suburb: 'Melbourne',
        state: 'VIC',
        country: 'AU',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        isActive: true,
        provenance: 'owner',
        claimStatus: 'claimed',
      },
    });
    expect(skp).not.toBeNull();
    const out = enrichPerformerStoreContextWithSkp(base, skp);
    expect(out.skpReady).toBe(true);
    expect(out.storeName).toBe('Demo Cafe');
    expect(out.storeSlug).toBe('demo-cafe');
    expect(out.suburb).toBe('Melbourne');
    expect(out.canonicalUrl).toContain('/s/demo-cafe');
    expect(out.skpVisibility.indexable).toBe(true);
    expect(out.skpVisibility.jsonLdReady).toBe(true);
    expect(out.listedServices).toHaveLength(1);
  });
});
