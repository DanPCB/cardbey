import type { BusinessCandidate } from '../types/index.js';
import type { IngestionSourceType, RawBusinessRecord } from '../../businessIngestion/types.js';

const PROVIDER_SOURCE: Record<string, IngestionSourceType> = {
  osm: 'open_data_url',
  csv: 'csv',
  referral: 'owner_submission',
  manual: 'owner_submission',
  government_register: 'registry_api',
  directory: 'licensed_feed',
  partner_import: 'partner_feed',
  vision: 'website_discovery',
};

export function providerToSourceType(providerId: string): IngestionSourceType {
  return PROVIDER_SOURCE[providerId] ?? 'open_data_url';
}

export function candidateOperatingRegion(candidate: BusinessCandidate): string | null {
  if (candidate.city) return candidate.city;
  return typeof candidate.metadata.region === 'string' ? candidate.metadata.region : null;
}

export function candidateToRawRecord(candidate: BusinessCandidate): RawBusinessRecord {
  const parts = [candidate.address, candidate.city, candidate.state, candidate.postcode, candidate.country]
    .filter(Boolean)
    .join(', ');

  return {
    sourceRowId: candidate.externalId,
    sourceType: providerToSourceType(candidate.providerId),
    sourceReference: candidate.sourceUrl ?? `${candidate.providerId}:${candidate.externalId}`,
    fetchedAt: candidate.discoveredAt,
    businessName: candidate.businessName,
    legalName: null,
    address: parts || candidate.address,
    phone: candidate.phone,
    website: candidate.website,
    category: candidate.category,
    registrationNumber: null,
    email: candidate.email,
    operatingRegion: candidateOperatingRegion(candidate),
    raw: {
      ...candidate.metadata,
      providerId: candidate.providerId,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      suburb: candidate.metadata.suburb ?? null,
      discoveryScore: candidate.metadata.discoveryScore ?? null,
      identityScore: candidate.metadata.identityScore ?? null,
      socialProfiles: candidate.socialProfiles,
      confidence: candidate.confidence,
    },
  };
}
