import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  BUSINESS_DISCOVERY_PROJECTION_VERSION,
  DISCOVERY_EVENT_TYPES,
  DISCOVERY_CACHE_NAMESPACES,
  DISCOVERY_CACHE_NAMESPACE_LIST,
  buildBusinessDiscoveryProjection,
  assertBusinessDiscoveryProjection,
  buildDiscoveryMetadata,
  buildDiscoveryEvent,
  buildDiscoveryProjection,
  generateDiscoveryProjection,
  validateDiscoveryProjection,
  emitDiscoveryEvent,
  subscribeDiscoveryEvent,
  clearDiscoveryEventBusForTests,
  setDiscoveryCache,
  getDiscoveryCache,
  invalidateDiscoveryCache,
  clearDiscoveryCachesForTests,
  isBusinessDiscoveryAuthoritative,
  isBusinessDiscoveryConsumerCutoverV1Enabled,
  isBusinessDiscoverySeoConsumerV1Enabled,
  getBusinessDiscoveryDiagnostics,
} from '../index.js';

const sampleArtifact = {
  artifactType: 'business',
  artifactVersion: 'v1',
  businessId: 'biz_1',
  tenantId: 'user_1',
  storeId: 'biz_1',
  slug: 'modern-security-doors',
  name: 'Modern Security Doors',
  category: 'trade',
  status: 'published',
  location: {
    address: '1 Example St',
    suburb: 'Richmond',
    city: 'Melbourne',
    state: 'VIC',
    postcode: '3121',
    country: 'AU',
    lat: -37.8,
    lng: 144.9,
    displayLabel: 'Richmond VIC',
  },
  content: {
    tagline: 'Secure your home',
    shortDescription: 'Security doors and screens for Melbourne homes.',
    description: 'Security doors and screens for Melbourne homes.',
    ctaPrimary: 'Get a quote',
    locale: 'en',
    socialLinks: [],
  },
  brand: { logoUrl: 'https://cdn.example/logo.png', colors: {} },
  hero: { type: 'image', imageUrl: 'https://cdn.example/hero.jpg', videoUrl: null },
  website: {
    sections: [{ type: 'hero', content: { headline: 'Secure your home' } }],
    navigation: null,
    seo: null,
  },
  commerce: {
    products: [
      {
        id: 'p1',
        name: 'Security Door',
        description: 'Steel security door',
        price: 890,
        imageUrl: 'https://cdn.example/door.jpg',
        categoryId: 'doors',
      },
    ],
    menus: [],
    orderingEnabled: false,
  },
  channels: {
    publicWebsite: {
      enabled: true,
      url: 'https://app.example/s/modern-security-doors',
    },
  },
  media: {
    images: ['https://cdn.example/door.jpg'],
    videos: [],
    heroAssets: ['https://cdn.example/hero.jpg'],
  },
  diagnostics: {
    projectionVersion: 'v1',
    warnings: [],
    source: 'test',
  },
};

describe('Business Discovery Layer Phase 4 — foundation', () => {
  beforeEach(() => {
    process.env.ENABLE_BUSINESS_DISCOVERY_LAYER_V1 = 'true';
    process.env.ENABLE_BUSINESS_DISCOVERY_PROJECTION_V1 = 'true';
    process.env.ENABLE_BUSINESS_DISCOVERY_VALIDATION_V1 = 'true';
    process.env.ENABLE_BUSINESS_DISCOVERY_EVENTS_V1 = 'true';
    process.env.ENABLE_BUSINESS_DISCOVERY_CACHE_V1 = 'true';
    delete process.env.ENABLE_BUSINESS_DISCOVERY_CONSUMER_CUTOVER_V1;
    delete process.env.ENABLE_BUSINESS_DISCOVERY_SEO_CONSUMER_V1;
    clearDiscoveryEventBusForTests();
    clearDiscoveryCachesForTests();
  });

  afterEach(() => {
    clearDiscoveryEventBusForTests();
    clearDiscoveryCachesForTests();
  });

  it('keeps BDL non-authoritative and SEO consumer off', () => {
    expect(isBusinessDiscoveryAuthoritative()).toBe(false);
    expect(isBusinessDiscoveryConsumerCutoverV1Enabled()).toBe(false);
    expect(isBusinessDiscoverySeoConsumerV1Enabled()).toBe(false);
    const diag = getBusinessDiscoveryDiagnostics();
    expect(diag.phase).toBe('phase4_foundation');
    expect(diag.consumersDeferred).toContain('multilingual_seo');
  });

  it('builds BusinessDiscoveryProjection from published artifact', () => {
    const result = buildDiscoveryProjection({ publishedArtifact: sampleArtifact });
    expect(result.ok).toBe(true);
    const p = assertBusinessDiscoveryProjection(result.projection);
    expect(p.projectionVersion).toBe(BUSINESS_DISCOVERY_PROJECTION_VERSION);
    expect(p.slug).toBe('modern-security-doors');
    expect(p.products).toHaveLength(1);
    expect(p.discoveryMetadata.canonicalUrl).toContain('/s/modern-security-doors');
    expect(p.languages.primaryLanguage).toBe('en');
  });

  it('builds from public store fallback', () => {
    const result = buildDiscoveryProjection({
      publicStore: {
        id: 'biz_2',
        slug: 'cafe-demo',
        name: 'Cafe Demo',
        description: 'Coffee and pastry',
        type: 'cafe',
        locale: 'en',
        isActive: true,
        products: [{ id: 'c1', name: 'Latte', price: 5 }],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.projection.diagnostics.source).toBe('public_store_dto');
    expect(result.projection.products[0].name).toBe('Latte');
  });

  it('validates publishable projection through discovery stages', () => {
    const { projection } = buildDiscoveryProjection({ publishedArtifact: sampleArtifact });
    const validation = validateDiscoveryProjection(projection);
    expect(validation.publishable).toBe(true);
    expect(validation.stages.businessValid).toBe(true);
    expect(validation.stages.slugValid).toBe(true);
    expect(validation.stages.languageValid).toBe(true);
  });

  it('fails validation when slug missing', () => {
    const projection = buildBusinessDiscoveryProjection({
      businessId: 'biz_x',
      name: 'No Slug Co',
      slug: null,
      business: { shortDescription: 'Desc' },
      languages: { primaryLanguage: 'en', availableLanguages: ['en'] },
      discoveryMetadata: buildDiscoveryMetadata({
        title: 'No Slug Co',
        description: 'Desc',
        primaryLanguage: 'en',
        availableLanguages: ['en'],
      }),
    });
    const validation = validateDiscoveryProjection(projection);
    expect(validation.publishable).toBe(false);
    expect(validation.issues.some((i) => i.code === 'missing_slug')).toBe(true);
  });

  it('emits generated and published discovery events', () => {
    const seen = [];
    subscribeDiscoveryEvent('*', (e) => seen.push(e.type));
    const result = generateDiscoveryProjection({
      publishedArtifact: sampleArtifact,
      emitEvents: true,
      writeCache: true,
    });
    expect(result.ok).toBe(true);
    expect(result.authoritative).toBe(false);
    expect(seen).toContain(DISCOVERY_EVENT_TYPES.GENERATED);
    expect(seen).toContain(DISCOVERY_EVENT_TYPES.PUBLISHED);
  });

  it('keeps cache namespaces separate', () => {
    expect(DISCOVERY_CACHE_NAMESPACE_LIST).toEqual(
      expect.arrayContaining([
        'projection',
        'metadata',
        'schema',
        'social',
        'ai',
        'directory',
        'sitemap',
      ]),
    );
    setDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.PROJECTION, 'biz_1', { a: 1 });
    setDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.METADATA, 'biz_1', { b: 2 });
    expect(getDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.PROJECTION, 'biz_1').value).toEqual({
      a: 1,
    });
    expect(getDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.METADATA, 'biz_1').value).toEqual({
      b: 2,
    });
    invalidateDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.PROJECTION, 'biz_1');
    expect(getDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.PROJECTION, 'biz_1').hit).toBe(false);
    expect(getDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.METADATA, 'biz_1').hit).toBe(true);
  });

  it('rejects unknown discovery event types', () => {
    expect(() =>
      buildDiscoveryEvent({
        type: 'business.discovery.hacked',
        businessId: 'biz_1',
      }),
    ).toThrow(/Unknown discovery event type/);
  });

  it('does not enable projection when layer flag off', () => {
    process.env.ENABLE_BUSINESS_DISCOVERY_LAYER_V1 = 'false';
    const result = buildDiscoveryProjection({ publishedArtifact: sampleArtifact });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('business_discovery_projection_disabled');
  });

  it('emitDiscoveryEvent fails closed when events disabled', () => {
    process.env.ENABLE_BUSINESS_DISCOVERY_EVENTS_V1 = 'false';
    const result = emitDiscoveryEvent({
      type: DISCOVERY_EVENT_TYPES.GENERATED,
      businessId: 'biz_1',
    });
    expect(result.ok).toBe(false);
  });
});
