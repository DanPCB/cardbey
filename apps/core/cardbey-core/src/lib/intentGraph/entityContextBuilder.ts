/**
 * Build canonical EntityContext from vision scan pipeline output.
 */

import { randomUUID } from 'node:crypto';
import type { EntityContext, EntityContextType, EntitySourceType } from '../intentGraph/types.js';
import type { VisionScanEvent } from '../visionDiscovery/visionScanTypes.js';
import type { ExtractedVisionEntity } from '../visionDiscovery/entityExtractionService.js';
import type { CardbeyMatchResult } from '../visionDiscovery/visionCardbeyMatcher.js';
import type { VisionScanType } from '../visionDiscovery/visionScanTypes.js';

function mapScanTypeToSource(scanType: VisionScanType): EntitySourceType {
  const map: Partial<Record<VisionScanType, EntitySourceType>> = {
    qr: 'qr',
    camera_photo: 'camera_photo',
    storefront_photo: 'storefront',
    business_card: 'business_card',
    menu_photo: 'menu',
    product_packaging: 'product',
    poster_flyer: 'flyer',
    website_screenshot: 'website',
    uploaded_image: 'uploaded_image',
    social_profile: 'website',
    receipt_invoice: 'uploaded_image',
  };
  return map[scanType] ?? 'uploaded_image';
}

function mapEntityType(
  type: string,
  privacyBlocked: boolean,
): EntityContextType {
  if (privacyBlocked) return 'sensitive_private';
  const map: Record<string, EntityContextType> = {
    cardbey_store: 'cardbey_store',
    external_business: 'external_business',
    service_organisation: 'service_organisation',
    product: 'product',
    event: 'event',
    personal_contact: 'personal_contact',
    unknown_link: 'unknown',
    non_business_content: 'unknown',
  };
  return map[type] ?? 'unknown';
}

export function buildEntityContext(input: {
  extracted: ExtractedVisionEntity;
  scanType: VisionScanType;
  scanEvent: VisionScanEvent | null;
  match: CardbeyMatchResult;
  userId?: string | null;
  sessionId?: string | null;
  privacyBlocked?: boolean;
  safetyFlags?: string[];
  imageAssetUrl?: string | null;
  detectedText?: string | null;
}): EntityContext {
  const privacyBlocked = input.privacyBlocked === true;
  const entityType = input.match.storeId
    ? 'cardbey_store'
    : mapEntityType(input.extracted.entityType, privacyBlocked);

  const evidence: string[] = [];
  if (input.extracted.domain) evidence.push(`domain:${input.extracted.domain}`);
  if (input.match.matchKind) evidence.push(`match:${input.match.matchKind}`);
  if (input.scanEvent?.status) evidence.push(`scan_status:${input.scanEvent.status}`);

  let privacyRisk: EntityContext['privacyRisk'] = 'none';
  if (privacyBlocked) privacyRisk = 'high';
  else if (entityType === 'personal_contact') privacyRisk = 'medium';

  return {
    id: randomUUID(),
    sourceType: mapScanTypeToSource(input.scanType),
    rawPayload: input.scanEvent?.rawPayload ?? null,
    imageAssetUrl: input.imageAssetUrl ?? input.scanEvent?.imageAssetUrl ?? null,
    detectedText: input.detectedText ?? input.scanEvent?.detectedText ?? null,
    detectedUrl: input.extracted.detectedUrl,
    resolvedUrl: input.extracted.resolvedUrl,
    entityName: input.extracted.entityName,
    entityType,
    category: input.extracted.category,
    address: input.extracted.address,
    phone: input.extracted.phone,
    email: input.extracted.email,
    website: input.extracted.website,
    socialProfiles: [],
    coordinates:
      input.scanEvent?.latitude != null && input.scanEvent?.longitude != null
        ? { latitude: input.scanEvent.latitude, longitude: input.scanEvent.longitude }
        : null,
    confidence: input.extracted.confidence,
    evidence,
    cardbeyMatch: input.match.storeId
      ? {
          storeId: input.match.storeId,
          slug: input.match.storeSlug,
          name: input.match.storeName,
        }
      : null,
    businessSeedMatch: input.match.seedId ? { seedId: input.match.seedId } : null,
    discoveryCandidateMatch: input.scanEvent?.id
      ? { scanEventId: input.scanEvent.id }
      : null,
    privacyRisk,
    safetyFlags: input.safetyFlags ?? [],
    scanEventId: input.scanEvent?.id ?? null,
    userId: input.userId ?? input.scanEvent?.userId ?? null,
    sessionId: input.sessionId ?? input.scanEvent?.sessionId ?? null,
    createdAt: new Date().toISOString(),
  };
}
