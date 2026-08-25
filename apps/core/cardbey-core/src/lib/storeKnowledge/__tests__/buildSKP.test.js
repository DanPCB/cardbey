import { describe, it, expect } from 'vitest';
import {
  ProvenanceTag,
  mapMission001StatusToSkp,
  mapBoiKnowledgeStateToSkp,
  buildSKPFromSources,
  skpToPublicDto,
  skpToJsonLd,
  resolveSkpVisibilityFlags,
} from '../index.js';

function baseBusiness(overrides = {}) {
  return {
    id: 'biz_test_1',
    slug: 'demo-cafe',
    name: 'Demo Cafe',
    description: 'A neighborhood cafe serving specialty coffee and light meals.',
    tagline: 'Coffee done right',
    type: 'Cafe',
    suburb: 'Melbourne',
    state: 'VIC',
    country: 'AU',
    address: '1 Test St',
    phone: '+61 3 9000 0000',
    email: 'hello@demo.test',
    websiteUrl: 'https://demo.test',
    lat: -37.81,
    lng: 144.96,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    isActive: true,
    provenance: 'owner',
    claimStatus: 'claimed',
    products: [{ id: 'p1', name: 'Latte' }],
    ...overrides,
  };
}

describe('storeKnowledge provenance maps', () => {
  it('maps Mission 001 statuses', () => {
    expect(mapMission001StatusToSkp('REAL')).toBe(ProvenanceTag.PLATFORM_OBSERVED);
    expect(mapMission001StatusToSkp('REAL', { ownerConfirmed: true })).toBe(
      ProvenanceTag.SELLER_CONFIRMED,
    );
    expect(mapMission001StatusToSkp('INFERRED')).toBe(ProvenanceTag.AI_INFERRED);
    expect(mapMission001StatusToSkp('GENERATED')).toBe(ProvenanceTag.AI_INFERRED);
    expect(mapMission001StatusToSkp('UNKNOWN')).toBe(ProvenanceTag.UNVERIFIED);
  });

  it('maps BOI knowledge states', () => {
    expect(mapBoiKnowledgeStateToSkp('USER_DEFINED')).toBe(ProvenanceTag.SELLER_CONFIRMED);
    expect(mapBoiKnowledgeStateToSkp('DISCOVERED_FACT')).toBe(ProvenanceTag.PLATFORM_OBSERVED);
    expect(mapBoiKnowledgeStateToSkp('AI_INFERENCE')).toBe(ProvenanceTag.AI_INFERRED);
    expect(mapBoiKnowledgeStateToSkp('ASSUMPTION')).toBe(ProvenanceTag.PLATFORM_INFERRED);
  });
});

describe('resolveSkpVisibilityFlags', () => {
  it('sets sitemapIncluded when indexable (Phase 2)', () => {
    const v = resolveSkpVisibilityFlags({
      indexable: true,
      jsonLdReady: true,
      attributionEnabled: false,
    });
    expect(v.sitemapIncluded).toBe(true);
    expect(v.aiSearchReady).toBe(false);
  });

  it('sets aiSearchReady only when crawlable + attribution enabled', () => {
    const v = resolveSkpVisibilityFlags({
      indexable: true,
      jsonLdReady: true,
      attributionEnabled: true,
    });
    expect(v.aiSearchReady).toBe(true);
  });
});

describe('buildSKPFromSources', () => {
  it('builds SKP from a published store', () => {
    const skp = buildSKPFromSources({ business: baseBusiness() });
    expect(skp).not.toBeNull();
    expect(skp.identity.storeId).toBe('biz_test_1');
    expect(skp.identity.slug).toBe('demo-cafe');
    expect(skp.visibility.canonicalUrl).toContain('/s/demo-cafe');
    expect(skp.visibility.aiSearchReady).toBe(false); // attributionV1 off by default
    expect(skp.visibility.sitemapIncluded).toBe(true); // Phase 2: indexable → sitemap
    expect(skp.visibility.jsonLdReady).toBe(true);
  });

  it('assigns SELLER_CONFIRMED for claimed owner stores', () => {
    const skp = buildSKPFromSources({ business: baseBusiness() });
    expect(skp.identity.businessName.provenance).toBe(ProvenanceTag.SELLER_CONFIRMED);
    expect(skp.content.description.provenance).toBe(ProvenanceTag.SELLER_CONFIRMED);
  });

  it('assigns AI_INFERRED description for unclaimed enriched stores', () => {
    const skp = buildSKPFromSources({
      business: baseBusiness({
        provenance: 'consumer_capture',
        claimStatus: 'unclaimed',
      }),
    });
    expect(skp.content.description.provenance).toBe(ProvenanceTag.AI_INFERRED);
  });

  it('returns null for unpublished stores', () => {
    const skp = buildSKPFromSources({
      business: baseBusiness({ publishedAt: null }),
    });
    expect(skp).toBeNull();
  });

  it('returns null for inactive stores', () => {
    const skp = buildSKPFromSources({
      business: baseBusiness({ isActive: false }),
    });
    expect(skp).toBeNull();
  });

  it('produces valid JSON-LD for a fully enriched store', () => {
    const skp = buildSKPFromSources({ business: baseBusiness() });
    const ld = skpToJsonLd(skp);
    expect(ld).not.toBeNull();
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBeDefined();
    expect(ld.name).toBe('Demo Cafe');
    expect(ld.url).toContain('/s/demo-cafe');
  });

  it('produces valid JSON-LD without suburb when name+description+category present', () => {
    const skp = buildSKPFromSources({
      business: baseBusiness({
        suburb: null,
        city: null,
        state: null,
        address: null,
      }),
    });
    expect(skp.visibility.jsonLdReady).toBe(true);
    const ld = skpToJsonLd(skp);
    expect(ld).not.toBeNull();
    expect(ld.name).toBe('Demo Cafe');
  });

  it('returns null JSON-LD for thin stores', () => {
    const skp = buildSKPFromSources({
      business: baseBusiness({
        description: null,
        type: 'Other',
        suburb: null,
        city: null,
      }),
    });
    expect(skp.visibility.jsonLdReady).toBe(false);
    expect(skpToJsonLd(skp)).toBeNull();
  });

  it('skpToPublicDto strips provenance wrappers', () => {
    const skp = buildSKPFromSources({ business: baseBusiness() });
    const dto = skpToPublicDto(skp);
    expect(dto.identity).toBeUndefined();
    expect(dto.name).toBe('Demo Cafe');
    expect(dto.description).toContain('specialty coffee');
    expect(dto.aiSearchReady).toBe(false);
  });

  it('merges published artifact category and hero', () => {
    const skp = buildSKPFromSources({
      business: baseBusiness({ type: 'Other', products: [] }),
      artifact: {
        category: 'Cafe',
        content: { description: 'Artifact description when needed.' },
        hero: { imageUrl: 'https://cdn.test/hero.jpg' },
        commerce: { products: [{ id: 'a1', name: 'Flat White' }] },
      },
    });
    expect(skp.classification.category.value).toBe('Cafe');
    expect(skp.content.heroImageUrl.value).toBe('https://cdn.test/hero.jpg');
    expect(skp.commerce.catalogItemCount.value).toBe(1);
  });
});
