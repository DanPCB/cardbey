/**
 * Unified marketplace discovery search — federates stores, products, services, menus, offers.
 */
import { prisma } from '../prisma.js';
import { caseInsensitiveFilter } from '../dbCapabilities.js';
import { publicStoreListWhere } from '../../services/publishedArtifactProjection/findPublicBusinesses.js';
import {
  isRestaurantBusiness,
  normalizeCatalogItem,
} from '../catalog/catalogItemClassification.js';
import { listPublicDiscoveryCards } from '../businessIngestion/DiscoveryCardService.js';
import type {
  DiscoveryEntityType,
  DiscoverySearchInput,
  DiscoverySearchResponse,
  DiscoverySearchResult,
} from './discoverySearchTypes.js';
import { DISCOVERY_ENTITY_TYPES } from './discoverySearchTypes.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SUGGESTION_LIMIT = 8;

function normalizeQuery(raw: string): string {
  return String(raw ?? '').trim();
}

function parseEntityTypes(raw?: DiscoveryEntityType[] | string): DiscoveryEntityType[] {
  if (!raw) return [...DISCOVERY_ENTITY_TYPES];
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(',')
        .map((s) => s.trim().toLowerCase());
  const valid = list.filter((t): t is DiscoveryEntityType =>
    (DISCOVERY_ENTITY_TYPES as readonly string[]).includes(t),
  );
  return valid.length > 0 ? valid : [...DISCOVERY_ENTITY_TYPES];
}

function textScore(query: string, fields: Array<string | null | undefined>, weights: number[]): number {
  const q = query.toLowerCase();
  if (!q) return 0;
  let score = 0;
  for (let i = 0; i < fields.length; i += 1) {
    const raw = fields[i];
    if (!raw) continue;
    const v = raw.toLowerCase();
    const w = weights[i] ?? 1;
    if (v === q) score += w * 10;
    else if (v.startsWith(q)) score += w * 6;
    else if (v.includes(q)) score += w * 3;
    else {
      const tokens = q.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        if (v.includes(token)) score += w;
      }
    }
  }
  return score;
}

function locationLabelFromBusiness(b: {
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  formattedAddress?: string | null;
}): string | null {
  const parts = [b.suburb, b.city, b.state].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return b.formattedAddress?.trim() || null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function proximityBoost(
  lat: number | null | undefined,
  lng: number | null | undefined,
  businessLat?: number | null,
  businessLng?: number | null,
): number {
  if (lat == null || lng == null || businessLat == null || businessLng == null) return 0;
  const km = haversineKm(lat, lng, businessLat, businessLng);
  if (km <= 2) return 8;
  if (km <= 10) return 5;
  if (km <= 25) return 2;
  return 0;
}

function recencyBoost(updatedAt?: Date | null): number {
  if (!updatedAt) return 0;
  const days = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 3;
  if (days <= 30) return 1;
  return 0;
}

function storeHref(slug: string, action?: string): string {
  const base = `/s/${slug}`;
  if (!action || action === 'open') return base;
  return `${base}?action=${action}`;
}

function rankResults(
  results: DiscoverySearchResult[],
  query: string,
): DiscoverySearchResult[] {
  const q = query.toLowerCase();
  return [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aExact = a.title.toLowerCase() === q ? 1 : 0;
    const bExact = b.title.toLowerCase() === q ? 1 : 0;
    if (bExact !== aExact) return bExact - aExact;
    return a.title.localeCompare(b.title);
  });
}

async function searchStores(
  query: string,
  opts: { location?: string; category?: string; lat?: number | null; lng?: number | null },
): Promise<DiscoverySearchResult[]> {
  const qFilter = caseInsensitiveFilter(query, 'contains');
  const where: Record<string, unknown> = {
    ...publicStoreListWhere(),
    OR: [
      { name: qFilter },
      { description: qFilter },
      { type: qFilter },
      { slug: qFilter },
      { suburb: qFilter },
      { city: qFilter },
      { state: qFilter },
      { formattedAddress: qFilter },
    ],
  };

  if (opts.location?.trim()) {
    const loc = caseInsensitiveFilter(opts.location.trim(), 'contains');
    where.AND = [
      {
        OR: [{ suburb: loc }, { city: loc }, { state: loc }, { formattedAddress: loc }],
      },
    ];
  }

  const rows = await prisma.business.findMany({
    where,
    take: 40,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      type: true,
      heroImageUrl: true,
      avatarImageUrl: true,
      suburb: true,
      city: true,
      state: true,
      formattedAddress: true,
      lat: true,
      lng: true,
      updatedAt: true,
      publishedAt: true,
    },
  });

  return rows.map((b) => {
    let score = textScore(query, [b.name, b.type, b.description, b.slug], [12, 4, 2, 3]);
    score += proximityBoost(opts.lat, opts.lng, b.lat, b.lng);
    score += recencyBoost(b.publishedAt ?? b.updatedAt);
    if (opts.category && b.type?.toLowerCase().includes(opts.category.toLowerCase())) {
      score += 2;
    }
    return {
      id: `store:${b.id}`,
      entityType: 'store' as const,
      title: b.name,
      subtitle: b.type,
      description: b.description,
      imageUrl: b.heroImageUrl ?? b.avatarImageUrl,
      href: storeHref(b.slug),
      storeSlug: b.slug,
      storeName: b.name,
      category: b.type,
      locationLabel: locationLabelFromBusiness(b),
      score,
    };
  });
}

function catalogEntityType(
  businessType: string | null | undefined,
  itemType: string,
): DiscoveryEntityType {
  if (isRestaurantBusiness(businessType)) return 'menu';
  if (itemType === 'service' || itemType === 'package' || itemType === 'ticket') return 'service';
  return 'product';
}

function catalogAction(entityType: DiscoveryEntityType): string {
  switch (entityType) {
    case 'menu':
      return 'menu';
    case 'service':
      return 'booking';
    case 'product':
      return 'shop';
    default:
      return 'open';
  }
}

async function searchCatalogItems(
  query: string,
  entityTypes: DiscoveryEntityType[],
  opts: { location?: string; lat?: number | null; lng?: number | null },
): Promise<DiscoverySearchResult[]> {
  const wantProduct = entityTypes.includes('product');
  const wantService = entityTypes.includes('service');
  const wantMenu = entityTypes.includes('menu');
  if (!wantProduct && !wantService && !wantMenu) return [];

  const qFilter = caseInsensitiveFilter(query, 'contains');
  const products = await prisma.product.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      OR: [
        { name: qFilter },
        { description: qFilter },
        { category: qFilter },
        { sku: qFilter },
      ],
      business: publicStoreListWhere(),
    },
    take: 60,
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      sku: true,
      imageUrl: true,
      price: true,
      currency: true,
      viewCount: true,
      isFeatured: true,
      updatedAt: true,
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          suburb: true,
          city: true,
          state: true,
          formattedAddress: true,
          lat: true,
          lng: true,
        },
      },
    },
  });

  const results: DiscoverySearchResult[] = [];
  for (const p of products) {
    const normalized = normalizeCatalogItem(p, {
      businessType: p.business.type,
      businessName: p.business.name,
    });
    const entityType = catalogEntityType(p.business.type, normalized.itemType);
    if (entityType === 'product' && !wantProduct) continue;
    if (entityType === 'service' && !wantService) continue;
    if (entityType === 'menu' && !wantMenu) continue;

    if (opts.location?.trim()) {
      const loc = opts.location.trim().toLowerCase();
      const label = locationLabelFromBusiness(p.business)?.toLowerCase() ?? '';
      if (!label.includes(loc)) continue;
    }

    let score = textScore(
      query,
      [p.name, p.category, p.description, p.sku, p.business.name],
      [10, 3, 2, 2, 4],
    );
    score += Math.min((p.viewCount ?? 0) / 10, 5);
    if (p.isFeatured) score += 4;
    score += proximityBoost(opts.lat, opts.lng, p.business.lat, p.business.lng);
    score += recencyBoost(p.updatedAt);

    const action = catalogAction(entityType);
    results.push({
      id: `${entityType}:${p.id}`,
      entityType,
      title: p.name,
      subtitle: p.business.name,
      description: p.description,
      imageUrl: p.imageUrl,
      href: storeHref(p.business.slug, action),
      storeSlug: p.business.slug,
      storeName: p.business.name,
      category: p.category ?? p.business.type,
      locationLabel: locationLabelFromBusiness(p.business),
      score,
    });
  }
  return results;
}

async function searchOffers(
  query: string,
  opts: { location?: string; lat?: number | null; lng?: number | null },
): Promise<DiscoverySearchResult[]> {
  const qFilter = caseInsensitiveFilter(query, 'contains');
  const [storeOffers, promos] = await Promise.all([
    prisma.storeOffer.findMany({
      where: {
        isActive: true,
        OR: [{ title: qFilter }, { description: qFilter }, { priceText: qFilter }],
        store: publicStoreListWhere(),
      },
      take: 30,
      select: {
        id: true,
        title: true,
        description: true,
        priceText: true,
        slug: true,
        updatedAt: true,
        store: {
          select: {
            name: true,
            slug: true,
            type: true,
            suburb: true,
            city: true,
            state: true,
            formattedAddress: true,
            lat: true,
            lng: true,
          },
        },
      },
    }),
    prisma.storePromo.findMany({
      where: {
        isActive: true,
        OR: [{ title: qFilter }, { description: qFilter }, { subtitle: qFilter }, { code: qFilter }],
        business: publicStoreListWhere(),
      },
      take: 30,
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        heroImageUrl: true,
        slug: true,
        updatedAt: true,
        business: {
          select: {
            name: true,
            slug: true,
            type: true,
            suburb: true,
            city: true,
            state: true,
            formattedAddress: true,
            lat: true,
            lng: true,
          },
        },
      },
    }),
  ]);

  const results: DiscoverySearchResult[] = [];

  for (const o of storeOffers) {
    if (opts.location?.trim()) {
      const loc = opts.location.trim().toLowerCase();
      const label = locationLabelFromBusiness(o.store)?.toLowerCase() ?? '';
      if (!label.includes(loc)) continue;
    }
    let score = textScore(query, [o.title, o.description, o.priceText, o.store.name], [10, 3, 2, 4]);
    score += proximityBoost(opts.lat, opts.lng, o.store.lat, o.store.lng);
    score += recencyBoost(o.updatedAt);
    results.push({
      id: `offer:${o.id}`,
      entityType: 'offer',
      title: o.title,
      subtitle: o.store.name,
      description: o.description ?? o.priceText,
      imageUrl: null,
      href: `/p/${o.store.slug}/offers/${o.slug}`,
      storeSlug: o.store.slug,
      storeName: o.store.name,
      category: o.store.type,
      locationLabel: locationLabelFromBusiness(o.store),
      score,
    });
  }

  for (const p of promos) {
    if (opts.location?.trim()) {
      const loc = opts.location.trim().toLowerCase();
      const label = locationLabelFromBusiness(p.business)?.toLowerCase() ?? '';
      if (!label.includes(loc)) continue;
    }
    let score = textScore(
      query,
      [p.title, p.subtitle, p.description, p.business.name],
      [10, 4, 3, 4],
    );
    score += proximityBoost(opts.lat, opts.lng, p.business.lat, p.business.lng);
    score += recencyBoost(p.updatedAt);
    results.push({
      id: `offer:promo:${p.id}`,
      entityType: 'offer',
      title: p.title,
      subtitle: p.business.name,
      description: p.subtitle ?? p.description,
      imageUrl: p.heroImageUrl,
      href: `/p/${p.slug}`,
      storeSlug: p.business.slug,
      storeName: p.business.name,
      category: p.business.type,
      locationLabel: locationLabelFromBusiness(p.business),
      score,
    });
  }

  return results;
}

async function searchDiscoveredBusinesses(query: string): Promise<DiscoverySearchResult[]> {
  try {
    const cards = await listPublicDiscoveryCards({ limit: 40 });
    const q = query.toLowerCase();
    return cards
      .filter((c) => {
        const hay = [c.businessName, c.category, c.categoryLabel, c.description, c.locationLabel]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .map((c) => ({
        id: `discovered:${c.id}`,
        entityType: 'store' as const,
        title: c.businessName,
        subtitle: c.categoryLabel ?? c.category,
        description: c.description,
        imageUrl: c.heroImageUrl,
        href: c.claimUrl,
        storeSlug: c.slug,
        storeName: c.businessName,
        category: c.categoryLabel ?? c.category,
        locationLabel: c.locationLabel,
        score: textScore(query, [c.businessName, c.categoryLabel, c.description], [10, 4, 2]) + 1,
      }));
  } catch {
    return [];
  }
}

export async function runDiscoverySearch(input: DiscoverySearchInput): Promise<DiscoverySearchResponse> {
  const query = normalizeQuery(input.query);
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(Math.max(1, input.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const entityTypes = parseEntityTypes(input.entityTypes);
  const lat = input.lat ?? null;
  const lng = input.lng ?? null;
  const location = input.location?.trim() || undefined;

  if (query.length < 2) {
    return {
      query,
      results: [],
      suggestions: [],
      total: 0,
      page,
      limit,
      hasMore: false,
    };
  }

  const tasks: Promise<DiscoverySearchResult[]>[] = [];
  if (entityTypes.includes('store')) {
    tasks.push(searchStores(query, { location, category: input.category, lat, lng }));
    tasks.push(searchDiscoveredBusinesses(query));
  }
  if (entityTypes.includes('product') || entityTypes.includes('service') || entityTypes.includes('menu')) {
    tasks.push(searchCatalogItems(query, entityTypes, { location, lat, lng }));
  }
  if (entityTypes.includes('offer')) {
    tasks.push(searchOffers(query, { location, lat, lng }));
  }

  const chunks = await Promise.all(tasks);
  const merged = rankResults(chunks.flat(), query);

  const deduped: DiscoverySearchResult[] = [];
  const seen = new Set<string>();
  for (const r of merged) {
    const key = `${r.entityType}:${r.title.toLowerCase()}:${r.storeSlug ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  const total = deduped.length;
  const offset = (page - 1) * limit;
  const pageResults = deduped.slice(offset, offset + limit);
  const suggestions = input.suggest ? deduped.slice(0, SUGGESTION_LIMIT) : [];

  return {
    query,
    results: pageResults,
    suggestions,
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  };
}
