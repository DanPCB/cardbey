/**
 * Vision → Discovery orchestration.
 * NEVER creates Business, DraftStore, or published stores.
 */

import { discoveryPromotionPipeline } from '../discoveryEngine/pipelines/DiscoveryPromotionPipeline.js';
import { assertDiscoverySeedsGoverned } from '../discoveryEngine/governance/runtimeAuthority.js';
import type { BusinessCandidate } from '../discoveryEngine/types/index.js';
import { approveSeed } from '../businessIngestion/QaPromotionService.js';
import { buildEntityContext } from '../intentGraph/entityContextBuilder.js';
import { detectVisionIntents } from '../intentGraph/intentDetectionService.js';
import { extractVisionEntity } from './entityExtractionService.js';
import { enrichVisionInputFromImage } from './imageVisionExtractionService.js';
import { saveEntityContext } from './EntityContextRepository.js';
import { matchVisionToCardbey } from './visionCardbeyMatcher.js';
import { assessVisionSensitivity } from './visionSensitivityGuard.js';
import { buildUserSessionContext } from './visionSessionContext.js';
import { recordIntentSuggestionsShown } from './VisionIntentEventRepository.js';
import {
  appendVisionScanEvent,
  getVisionScanEventById,
  listVisionScanEvents,
  normalizeScanType,
  patchVisionScanEvent,
} from './VisionScanEventRepository.js';
import {
  isVisionAutoSeedEnabled,
  isVisionScanStorageEnabled,
  isVisionToDiscoveryEnabled,
} from './visionScanFlags.js';
import type {
  VisionProcessEntityInput,
  VisionProcessEntityResult,
  VisionScanEvent,
  VisionScanEventStatus,
  VisionScanListFilters,
  VisionUserResult,
} from './visionScanTypes.js';

function healthDisclaimer(isHealthRelated: boolean): string | null {
  if (!isHealthRelated) return null;
  return 'This appears to be an information/support service — not medical advice. For health concerns, contact the service or a qualified health professional.';
}

function discoveryMessage(status: VisionScanEventStatus): string | null {
  switch (status) {
    case 'candidate_created':
      return 'Not on Cardbey yet. We’ll review it before creating a public listing.';
    case 'candidate_duplicate':
      return 'We already have this business in our review queue.';
    case 'candidate_needs_review':
      return 'This may match an existing listing — our team will review it.';
    case 'matched_existing_cardbey_store':
      return null;
    case 'blocked_sensitive':
      return 'This scan was not added to discovery for privacy reasons.';
    case 'ignored_non_business':
      return null;
    default:
      return null;
  }
}

function toUserResult(
  extracted: ReturnType<typeof extractVisionEntity>,
  status: VisionScanEventStatus,
  event: VisionScanEvent | null,
): VisionUserResult {
  const isCardbeyStore = extracted.entityType === 'cardbey_store' || Boolean(event?.cardbeyMatchId);
  return {
    title: extracted.title,
    subtitle: extracted.subtitle,
    summary: extracted.userFacingSummary,
    entityType: extracted.entityType,
    openUrl: extracted.resolvedUrl,
    isCardbeyStore,
    notOnCardbeyNote:
      isCardbeyStore || status === 'blocked_sensitive' || status === 'ignored_non_business'
        ? null
        : 'Not on Cardbey yet',
    healthDisclaimer: healthDisclaimer(extracted.isHealthRelated),
    discoveryStatus: status,
    scanEventId: event?.id ?? null,
    cardbeyMatchId: event?.cardbeyMatchId ?? null,
    businessSeedId: event?.businessSeedId ?? null,
    canSuggestToCardbey:
      !isCardbeyStore &&
      status !== 'blocked_sensitive' &&
      status !== 'ignored_non_business' &&
      extracted.entityType !== 'personal_contact',
    discoveryMessage: discoveryMessage(status),
  };
}

function visionCandidateFromEvent(
  event: VisionScanEvent,
  referredByUserId?: string | null,
): BusinessCandidate {
  return {
    providerId: 'vision',
    externalId: event.id,
    businessName: event.entityName,
    category: event.category,
    address: event.address,
    city: null,
    state: null,
    postcode: null,
    country: null,
    latitude: event.latitude,
    longitude: event.longitude,
    phone: event.phone,
    email: event.email,
    website: event.website,
    socialProfiles: [],
    sourceUrl: event.resolvedUrl ?? event.detectedUrl,
    discoveredAt: event.createdAt,
    confidence: event.confidence,
    metadata: {
      scanType: event.scanType,
      rawPayload: event.rawPayload,
      userFacingSummary: event.userFacingSummary,
      visionScanEventId: event.id,
      referredByUserId: referredByUserId ?? event.userId,
      domain: event.domain,
      entityType: event.entityType,
    },
  };
}

async function promoteVisionEvent(
  event: VisionScanEvent,
  referredByUserId?: string | null,
): Promise<{
  status: VisionScanEventStatus;
  seedId: string | null;
  duplicate: boolean;
  needsReview: boolean;
}> {
  const candidate = visionCandidateFromEvent(event, referredByUserId);
  const promotion = await discoveryPromotionPipeline.promote([candidate], {
    batchId: `vision-scan-${event.id}`,
  });
  assertDiscoverySeedsGoverned(promotion.seeds);

  if (promotion.rejectedDuplicates.length > 0) {
    return { status: 'candidate_duplicate', seedId: null, duplicate: true, needsReview: false };
  }
  if (promotion.reviewRequired.length > 0 && promotion.seeds.length === 0) {
    return { status: 'candidate_needs_review', seedId: null, duplicate: false, needsReview: true };
  }
  const seed = promotion.seeds[0] ?? null;
  return {
    status: 'candidate_created',
    seedId: seed?.id ?? null,
    duplicate: false,
    needsReview: promotion.reviewRequired.length > 0,
  };
}

export async function createVisionScanEventRecord(
  input: VisionProcessEntityInput,
): Promise<{ event: VisionScanEvent | null; userResult: VisionUserResult }> {
  const scanType = normalizeScanType(input.scanType);
  const extracted = extractVisionEntity(input);
  const sensitivity = assessVisionSensitivity({
    entityType: extracted.entityType,
    scanType,
    rawPayload: input.rawPayload,
    detectedText: input.detectedText,
    isHealthRelated: extracted.isHealthRelated,
  });

  let status: VisionScanEventStatus = 'scanned';
  if (sensitivity.blocked) status = 'blocked_sensitive';
  else if (sensitivity.ignored) status = 'ignored_non_business';

  const match = await matchVisionToCardbey({
    rawPayload: input.rawPayload,
    entityName: extracted.entityName,
    website: extracted.website,
    domain: extracted.domain,
    phone: extracted.phone,
    email: extracted.email,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  if (match.storeId) {
    status = 'matched_existing_cardbey_store';
  } else if (match.seedId && status === 'scanned') {
    status = 'candidate_duplicate';
  } else if (match.priorScan?.businessSeedId && status === 'scanned') {
    status = 'candidate_duplicate';
  }

  if (!isVisionScanStorageEnabled()) {
    return {
      event: null,
      userResult: toUserResult(extracted, status, null),
    };
  }

  const event = await appendVisionScanEvent({
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    scanType,
    rawPayload: input.rawPayload ?? null,
    imageAssetUrl: input.imageAssetUrl ?? null,
    detectedText: input.detectedText ?? null,
    detectedUrl: extracted.detectedUrl,
    resolvedUrl: extracted.resolvedUrl,
    domain: extracted.domain,
    entityName: extracted.entityName,
    entityType: extracted.entityType,
    category: extracted.category,
    phone: extracted.phone,
    email: extracted.email,
    website: extracted.website,
    address: extracted.address,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    confidence: extracted.confidence,
    cardbeyMatchId: match.storeId,
    discoveryCandidateId: match.seedId,
    businessSeedId: match.seedId ?? match.priorScan?.businessSeedId ?? null,
    userFacingSummary: extracted.userFacingSummary,
    status,
    metadata: {
      sensitivityReason: sensitivity.reason,
      matchKind: match.matchKind,
      clientClassification: input.clientClassification ?? null,
    },
  });

  return {
    event,
    userResult: toUserResult(extracted, status, event),
  };
}

export async function processVisionEntity(
  input: VisionProcessEntityInput & {
    imageBuffer?: Buffer | null;
    mimeType?: string | null;
    tenantKey?: string | null;
  },
): Promise<VisionProcessEntityResult> {
  const enriched = await enrichVisionInputFromImage(input);
  const scanType = normalizeScanType(enriched.scanType);
  const extracted = extractVisionEntity(enriched);
  const sensitivity = assessVisionSensitivity({
    entityType: extracted.entityType,
    scanType,
    rawPayload: enriched.rawPayload,
    detectedText: enriched.detectedText,
    isHealthRelated: extracted.isHealthRelated,
  });

  const match = await matchVisionToCardbey({
    rawPayload: enriched.rawPayload,
    entityName: extracted.entityName,
    website: extracted.website,
    domain: extracted.domain,
    phone: extracted.phone,
    email: extracted.email,
    latitude: enriched.latitude,
    longitude: enriched.longitude,
  });

  const { event, userResult } = await createVisionScanEventRecord(enriched);

  const entityContext = buildEntityContext({
    extracted,
    scanType,
    scanEvent: event,
    match,
    userId: enriched.userId,
    sessionId: enriched.sessionId,
    privacyBlocked: sensitivity.blocked,
    safetyFlags: sensitivity.reason ? [sensitivity.reason] : [],
    imageAssetUrl: enriched.imageAssetUrl,
    detectedText: enriched.detectedText,
  });

  if (isVisionScanStorageEnabled()) {
    await saveEntityContext(entityContext);
  }

  const session = buildUserSessionContext({
    userId: enriched.userId,
    sessionId: enriched.sessionId,
    ownsMatchedStore: false,
  });
  const intentSuggestions = detectVisionIntents(entityContext, session);

  if (event?.id && intentSuggestions.length) {
    await recordIntentSuggestionsShown({
      entityContextId: entityContext.id,
      scanEventId: event.id,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      suggestionsShown: intentSuggestions.map((s) => s.intentId),
    });
  }

  const shouldAutoPromote =
    isVisionToDiscoveryEnabled() &&
    isVisionAutoSeedEnabled() &&
    enriched.autoPromote !== false;

  if (
    shouldAutoPromote &&
    event &&
    userResult.canSuggestToCardbey &&
    event.status === 'scanned' &&
    sensitivity.pipelineEligible
  ) {
    const promoted = await promoteVisionEvent(event, enriched.userId);
    const patched = await patchVisionScanEvent(event.id, {
      status: promoted.status,
      businessSeedId: promoted.seedId ?? event.businessSeedId,
    });
    return {
      ok: true,
      userResult: toUserResult(extractVisionEntity(enriched), promoted.status, patched ?? event),
      event: patched ?? event,
      entityContext: entityContext as unknown as Record<string, unknown>,
      intentSuggestions,
    };
  }

  return {
    ok: true,
    userResult,
    event,
    entityContext: entityContext as unknown as Record<string, unknown>,
    intentSuggestions,
  };
}

export async function promoteVisionScanToDiscovery(
  scanEventId: string,
  userId?: string | null,
): Promise<{ ok: boolean; userResult?: VisionUserResult; error?: string }> {
  if (!isVisionToDiscoveryEnabled()) {
    return { ok: false, error: 'vision_to_discovery_disabled' };
  }

  const event = await getVisionScanEventById(scanEventId);
  if (!event) return { ok: false, error: 'scan_event_not_found' };

  if (event.cardbeyMatchId) {
    return { ok: false, error: 'already_on_cardbey' };
  }
  if (event.status === 'blocked_sensitive' || event.status === 'ignored_non_business') {
    return { ok: false, error: 'not_eligible_for_discovery' };
  }
  if (event.businessSeedId) {
    return {
      ok: true,
      userResult: toUserResult(
        {
          entityName: event.entityName,
          entityType: event.entityType,
          category: event.category,
          phone: event.phone,
          email: event.email,
          website: event.website,
          address: event.address,
          detectedUrl: event.detectedUrl,
          resolvedUrl: event.resolvedUrl,
          domain: event.domain,
          confidence: event.confidence,
          userFacingSummary: event.userFacingSummary ?? '',
          title: event.entityName ?? 'Scanned item',
          subtitle: event.category ?? 'Business',
          isHealthRelated: false,
        },
        'candidate_duplicate',
        event,
      ),
    };
  }

  const promoted = await promoteVisionEvent(event, userId);
  const patched = await patchVisionScanEvent(event.id, {
    status: promoted.status,
    businessSeedId: promoted.seedId ?? event.businessSeedId,
  });

  const extracted = extractVisionEntity({
    rawPayload: event.rawPayload,
    detectedText: event.detectedText,
    scanType: event.scanType,
    clientClassification: {
      type: event.entityType,
      title: event.entityName ?? undefined,
      subtitle: event.category ?? undefined,
      summary: event.userFacingSummary ?? undefined,
      openUrl: event.resolvedUrl,
      domain: event.domain ?? undefined,
    },
  });

  return {
    ok: true,
    userResult: toUserResult(extracted, promoted.status, patched ?? event),
  };
}

export async function listVisionDiscoveryScans(filters: VisionScanListFilters = {}) {
  return listVisionScanEvents(filters);
}

export async function approveVisionScanCandidate(
  scanEventId: string,
  adminUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const event = await getVisionScanEventById(scanEventId);
  if (!event) return { ok: false, error: 'scan_event_not_found' };

  let seedId = event.businessSeedId;
  if (!seedId) {
    const promoted = await promoteVisionScanToDiscovery(scanEventId, event.userId);
    if (!promoted.ok) return { ok: false, error: promoted.error ?? 'promote_failed' };
    const refreshed = await getVisionScanEventById(scanEventId);
    seedId = refreshed?.businessSeedId ?? null;
  }
  if (!seedId) return { ok: false, error: 'no_seed_to_approve' };

  await approveSeed(seedId, adminUserId, `Approved from vision scan ${scanEventId}`);
  await patchVisionScanEvent(scanEventId, { status: 'candidate_created' });
  return { ok: true };
}

export async function ignoreVisionScanCandidate(scanEventId: string): Promise<{ ok: boolean }> {
  await patchVisionScanEvent(scanEventId, { status: 'ignored_non_business' });
  return { ok: true };
}

export async function buildVisionDiscoveryMetrics() {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();
  const scans = await listVisionScanEvents({ limit: 500 });

  return {
    scansToday: scans.filter((s) => s.createdAt >= since).length,
    candidatesCreated: scans.filter((s) => s.status === 'candidate_created').length,
    duplicates: scans.filter((s) => s.status === 'candidate_duplicate').length,
    needsReview: scans.filter((s) => s.status === 'candidate_needs_review').length,
    ignoredOrBlocked: scans.filter(
      (s) => s.status === 'ignored_non_business' || s.status === 'blocked_sensitive',
    ).length,
    recentScans: scans.slice(0, 50),
  };
}
