/**
 * Match vision scans against existing Cardbey stores and ingestion seeds.
 */

import { getPrismaClient } from '../prisma.js';
import { listSeedRecords } from '../businessIngestion/IngestionRepository.js';
import { businessIdentityEngine } from '../discoveryEngine/dedupe/BusinessIdentityEngine.js';
import type { BusinessCandidate } from '../discoveryEngine/types/index.js';
import { resolveDeepLink } from '../vision/visionDeepLinkResolver.js';
import { matchStoreByVisionExtraction } from '../ghostStore/storeMatchByVision.js';
import {
  findVisionScanByFingerprint,
} from './VisionScanEventRepository.js';
import type { VisionScanEvent } from './visionScanTypes.js';

function hostFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.includes('://') ? website : `https://${website}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export type CardbeyMatchResult = {
  storeId: string | null;
  storeSlug: string | null;
  storeName: string | null;
  seedId: string | null;
  priorScan: VisionScanEvent | null;
  matchKind: 'cardbey_url' | 'store_name' | 'website_domain' | 'seed_corpus' | 'prior_scan' | null;
};

export async function matchVisionToCardbey(input: {
  rawPayload?: string | null;
  entityName?: string | null;
  website?: string | null;
  domain?: string | null;
  phone?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<CardbeyMatchResult> {
  const priorScan = await findVisionScanByFingerprint({
    domain: input.domain,
    resolvedUrl: input.website,
    rawPayload: input.rawPayload,
    entityName: input.entityName,
  });
  if (priorScan?.businessSeedId) {
    return {
      storeId: priorScan.cardbeyMatchId,
      storeSlug: null,
      storeName: priorScan.entityName,
      seedId: priorScan.businessSeedId,
      priorScan,
      matchKind: 'prior_scan',
    };
  }

  const payload = String(input.rawPayload ?? '').trim();
  if (payload) {
    const deep = resolveDeepLink(payload);
    if (deep.action === 'open_store') {
      const prisma = getPrismaClient();
      if (deep.storeId) {
        const store = await prisma.business.findUnique({
          where: { id: deep.storeId },
          select: { id: true, name: true, slug: true },
        });
        if (store) {
          return {
            storeId: store.id,
            storeSlug: store.slug,
            storeName: store.name,
            seedId: null,
            priorScan,
            matchKind: 'cardbey_url',
          };
        }
      }
      if (deep.slug) {
        const store = await prisma.business.findFirst({
          where: { slug: deep.slug, isActive: true },
          select: { id: true, name: true, slug: true },
        });
        if (store) {
          return {
            storeId: store.id,
            storeSlug: store.slug,
            storeName: store.name,
            seedId: null,
            priorScan,
            matchKind: 'cardbey_url',
          };
        }
      }
    }
  }

  const location =
    input.latitude != null && input.longitude != null
      ? { lat: input.latitude, lng: input.longitude }
      : null;
  const byName = await matchStoreByVisionExtraction(input.entityName, location);
  if (byName) {
    return {
      storeId: byName.id,
      storeSlug: byName.slug,
      storeName: byName.name,
      seedId: null,
      priorScan,
      matchKind: 'store_name',
    };
  }

  const domain = input.domain ?? hostFromWebsite(input.website);
  if (domain && !/cardbey/i.test(domain)) {
    const prisma = getPrismaClient();
    const stores = await prisma.business.findMany({
      where: {
        isActive: true,
        websiteUrl: { contains: domain },
      },
      select: { id: true, name: true, slug: true },
      take: 3,
    });
    if (stores.length === 1) {
      return {
        storeId: stores[0].id,
        storeSlug: stores[0].slug,
        storeName: stores[0].name,
        seedId: null,
        priorScan,
        matchKind: 'website_domain',
      };
    }
  }

  const seeds = await listSeedRecords();
  const candidate: BusinessCandidate = {
    providerId: 'vision',
    externalId: 'probe',
    businessName: input.entityName ?? null,
    category: null,
    address: null,
    city: null,
    state: null,
    postcode: null,
    country: null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    socialProfiles: [],
    sourceUrl: input.website,
    discoveredAt: new Date().toISOString(),
    confidence: 0.5,
    metadata: {},
  };

  const corpus: BusinessCandidate[] = seeds.map((s) => ({
    providerId: 'manual',
    externalId: s.id,
    businessName: s.normalized.businessName,
    category: s.normalized.category,
    address: s.normalized.address,
    city: s.normalized.city,
    state: s.normalized.state,
    postcode: null,
    country: s.normalized.country,
    latitude: null,
    longitude: null,
    phone: s.normalized.phone,
    email: s.normalized.email,
    website: s.normalized.website,
    socialProfiles: [],
    sourceUrl: s.normalized.sourceReference,
    discoveredAt: s.createdAt,
    confidence: 1,
    metadata: {},
  }));

  const score = businessIdentityEngine.bestMatchScore(candidate, corpus, 'probe');
  if (score >= 70) {
    const best = corpus
      .map((c) => ({ c, score: businessIdentityEngine.scorePair(candidate, c) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 70) {
      return {
        storeId: null,
        storeSlug: null,
        storeName: best.c.businessName,
        seedId: best.c.externalId,
        priorScan,
        matchKind: 'seed_corpus',
      };
    }
  }

  return {
    storeId: null,
    storeSlug: null,
    storeName: null,
    seedId: null,
    priorScan,
    matchKind: null,
  };
}
