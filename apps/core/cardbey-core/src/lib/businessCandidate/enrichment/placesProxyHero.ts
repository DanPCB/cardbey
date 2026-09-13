/**
 * Build placeId-bound public Places photo proxy URL for enrichment heroes.
 */

import { extractProviderPhotoRef } from '../media/mediaDiscoveryAgent.js';

export function buildPlacesProxyHeroUrl(input: {
  placeId?: string | null;
  rawSourceJson?: Record<string, unknown> | null;
}): { url: string; photoName?: string; photoReference?: string } | null {
  const placeId = String(input.placeId ?? '').trim();
  if (!placeId) return null;
  const extracted = extractProviderPhotoRef(input.rawSourceJson ?? null);
  if (!extracted) return null;

  const params = new URLSearchParams({ placeId });
  if (extracted.photoName) {
    const embedded = /^places\/([^/]+)\/photos\//i.exec(extracted.photoName)?.[1];
    if (embedded && embedded !== placeId) return null;
    params.set('photoName', extracted.photoName);
    return {
      url: `/api/public/places-photo?${params.toString()}`,
      photoName: extracted.photoName,
    };
  }
  if (extracted.photoReference) {
    params.set('photoReference', extracted.photoReference);
    return {
      url: `/api/public/places-photo?${params.toString()}`,
      photoReference: extracted.photoReference,
    };
  }
  return null;
}
