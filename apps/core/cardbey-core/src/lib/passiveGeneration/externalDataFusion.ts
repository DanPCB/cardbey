/**
 * External data fusion — merge user, uploaded, discovered, and acquired data
 * into a unified BusinessEntity graph with per-field provenance.
 */

import type { FieldProvenance, ScoredField } from './confidenceResolver.js';
import {
  mergeFieldConfidence,
  provenanceFromSource,
  scoreField,
  overallEntityConfidence,
  flagLowConfidenceFields,
} from './confidenceResolver.js';
import type { AcquisitionTaskType } from './intentGapAnalyzer.js';

export interface MediaAsset {
  url: string;
  type: 'image' | 'video';
  role?: 'hero' | 'logo' | 'gallery' | 'menu';
  attribution?: string | null;
}

export interface ReviewSnippet {
  rating: number | null;
  count: number | null;
  source: string;
}

export interface BusinessEntity {
  canonicalName: ScoredField<string | null>;
  aliases: string[];
  categories: ScoredField<string[]>;
  services: ScoredField<string[]>;
  geo: ScoredField<{ lat: number | null; lng: number | null; address: string | null; locality: string | null }>;
  branding: ScoredField<{ primaryColor?: string; secondaryColor?: string; tagline?: string }>;
  socialLinks: ScoredField<Record<string, string>>;
  mediaAssets: ScoredField<MediaAsset[]>;
  menu: ScoredField<unknown>;
  openingHours: ScoredField<unknown>;
  contact: ScoredField<{ phone?: string; email?: string; website?: string }>;
  reviews: ScoredField<ReviewSnippet | null>;
  confidence: number;
  provenance: FieldProvenance[];
  lowConfidenceFields: ReturnType<typeof flagLowConfidenceFields>;
}

export interface AcquisitionPayload {
  task: AcquisitionTaskType;
  sourceId: string;
  ok: boolean;
  data: Record<string, unknown>;
  attribution?: FieldProvenance;
}

export interface FusionInput {
  userEntities?: Record<string, unknown>;
  uploads?: Record<string, unknown>;
  acquisitions?: AcquisitionPayload[];
}

function emptyScored<T>(value: T): ScoredField<T> {
  return { value, confidence: 0, provenance: [], needsConfirmation: true };
}

function pushProv(list: FieldProvenance[], p: FieldProvenance | undefined | null): FieldProvenance[] {
  if (!p) return list;
  return [...list, p];
}

function mergeScoredStrings(
  existing: ScoredField<string | null>,
  value: string | null,
  prov: FieldProvenance,
): ScoredField<string | null> {
  if (!value) return existing;
  const provenance = pushProv(existing.provenance, prov);
  return scoreField(existing.value ?? value, provenance);
}

function mergeScoredArray(
  existing: ScoredField<string[]>,
  values: string[],
  prov: FieldProvenance,
): ScoredField<string[]> {
  const merged = [...new Set([...(existing.value ?? []), ...values])];
  const provenance = pushProv(existing.provenance, prov);
  return scoreField(merged, provenance);
}

/**
 * Combine all input channels into a unified BusinessEntity graph.
 */
export function mergeAcquiredData(input: FusionInput): BusinessEntity {
  let entity: BusinessEntity = {
    canonicalName: emptyScored(null),
    aliases: [],
    categories: emptyScored([]),
    services: emptyScored([]),
    geo: emptyScored({ lat: null, lng: null, address: null, locality: null }),
    branding: emptyScored({}),
    socialLinks: emptyScored({}),
    mediaAssets: emptyScored([]),
    menu: emptyScored(null),
    openingHours: emptyScored(null),
    contact: emptyScored({}),
    reviews: emptyScored(null),
    confidence: 0,
    provenance: [],
    lowConfidenceFields: [],
  };

  const apply = (data: Record<string, unknown>, source: string, provExtra?: Partial<FieldProvenance>) => {
    const prov = provenanceFromSource(source, 0, provExtra);

    const name = (data.businessName ?? data.name) as string | undefined;
    if (name) {
      entity.canonicalName = mergeScoredStrings(entity.canonicalName, String(name), prov);
      if (name !== entity.canonicalName.value) entity.aliases.push(String(name));
    }

    const cat = (data.category ?? data.businessType ?? data.type) as string | undefined;
    if (cat) {
      entity.categories = mergeScoredArray(entity.categories, [String(cat)], prov);
    }

    if (data.services && Array.isArray(data.services)) {
      entity.services = mergeScoredArray(
        entity.services,
        data.services.map(String),
        prov,
      );
    }

    const address = data.address as string | undefined;
    const location = data.location as string | undefined;
    const lat = data.lat as number | undefined;
    const lng = data.lng as number | undefined;
    if (address || location || lat != null) {
      const geoVal = {
        lat: lat ?? entity.geo.value.lat,
        lng: lng ?? entity.geo.value.lng,
        address: address ?? entity.geo.value.address,
        locality: location ?? entity.geo.value.locality,
      };
      entity.geo = scoreField(geoVal, pushProv(entity.geo.provenance, prov));
    }

    const contact = { ...entity.contact.value };
    if (data.phone) contact.phone = String(data.phone);
    if (data.email) contact.email = String(data.email);
    if (data.website) contact.website = String(data.website);
    if (Object.keys(contact).length) {
      entity.contact = scoreField(contact, pushProv(entity.contact.provenance, prov));
    }

    if (data.openingHours) {
      entity.openingHours = scoreField(data.openingHours, pushProv(entity.openingHours.provenance, prov));
    }

    if (data.menu || data.menuItems) {
      entity.menu = scoreField(data.menu ?? data.menuItems, pushProv(entity.menu.provenance, prov));
    }

    if (data.socialLinks && typeof data.socialLinks === 'object') {
      entity.socialLinks = scoreField(
        { ...entity.socialLinks.value, ...(data.socialLinks as Record<string, string>) },
        pushProv(entity.socialLinks.provenance, prov),
      );
    }

    if (data.primaryColor || data.brandColors) {
      entity.branding = scoreField(
        {
          ...entity.branding.value,
          ...(typeof data.brandColors === 'object' ? data.brandColors : {}),
          primaryColor: data.primaryColor as string | undefined,
        },
        pushProv(entity.branding.provenance, prov),
      );
    }

    if (data.rating != null || data.reviewCount != null) {
      entity.reviews = scoreField(
        {
          rating: typeof data.rating === 'number' ? data.rating : null,
          count: typeof data.reviewCount === 'number' ? data.reviewCount : null,
          source,
        },
        pushProv(entity.reviews.provenance, prov),
      );
    }

    const photos = data.photos as string[] | undefined;
    if (photos?.length) {
      const assets: MediaAsset[] = photos.map((url) => ({
        url,
        type: 'image' as const,
        role: 'gallery' as const,
        attribution: provExtra?.attributionText ?? null,
      }));
      entity.mediaAssets = scoreField(
        [...entity.mediaAssets.value, ...assets],
        pushProv(entity.mediaAssets.provenance, prov),
      );
    }

    if (data.heroMedia || data.heroImageUrl) {
      const url = String(data.heroMedia ?? data.heroImageUrl);
      entity.mediaAssets = scoreField(
        [
          ...entity.mediaAssets.value,
          { url, type: 'image', role: 'hero', attribution: provExtra?.attributionText ?? null },
        ],
        pushProv(entity.mediaAssets.provenance, prov),
      );
    }

    entity.provenance = pushProv(entity.provenance, prov);
  };

  if (input.userEntities) {
    apply(input.userEntities, 'manual', { confidence: 0.5 });
  }
  if (input.uploads) {
    apply(input.uploads, 'user_upload', { confidence: 0.95 });
  }
  for (const acq of input.acquisitions ?? []) {
    if (!acq.ok) continue;
    apply(acq.data, acq.sourceId, acq.attribution ?? { source: acq.sourceId, confidence: 0.5, timestamp: new Date().toISOString() });
  }

  const fieldMap: Record<string, ScoredField<unknown>> = {
    canonicalName: entity.canonicalName as ScoredField<unknown>,
    categories: entity.categories as ScoredField<unknown>,
    geo: entity.geo as ScoredField<unknown>,
    contact: entity.contact as ScoredField<unknown>,
    mediaAssets: entity.mediaAssets as ScoredField<unknown>,
    menu: entity.menu as ScoredField<unknown>,
  };

  entity.confidence = overallEntityConfidence(fieldMap);
  entity.lowConfidenceFields = flagLowConfidenceFields(fieldMap);
  return entity;
}

export { mergeFieldConfidence };
