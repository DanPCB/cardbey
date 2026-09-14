/**
 * Acquire DiscoveryCandidate → Universal Library (no competing SSOT).
 * Prefer PROVIDER_HOSTED; never permanent custody by default.
 * Do not download first and validate later — rights must pass first.
 */

import { resolveAcquisitionDecision, ACQUISITION_DECISION } from './acquisitionDecision.js';
import { recordMediaAcquisitionEvent } from './observability.js';
import { findAssetByProviderRemoteId } from '../universalLibrary/providerRemoteLookup.js';
import { createUniversalAsset, publishUniversalAsset } from '../universalLibrary/universalAssetService.js';
import {
  ASSET_STATUS,
  HOSTING_MODE,
  RIGHTS_STATUS,
} from '../universalLibrary/universalAssetTypes.js';
import { classifyOpenMediaLicense } from '../universalLibrary/openMediaRights.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} candidate
 * @param {{ userId?: string, forceReference?: boolean, attributionText?: string, skipPublish?: boolean }} [opts]
 */
export async function acquireCandidateToLibrary(prisma, candidate, opts = {}) {
  if (!prisma) return { ok: false, error: 'prisma_required' };
  if (!candidate?.provider || !candidate?.providerAssetId) {
    return { ok: false, error: 'candidate_identity_required' };
  }

  const decision = resolveAcquisitionDecision({
    provider: candidate.provider,
    sourceId: `src_${candidate.provider}`,
    license: candidate.license,
    attributionText: opts.attributionText || candidate.attributionText,
    attributionRequired: candidate.attributionRequired,
  });

  // Approved review may override MANUAL_REVIEW → REMOTE_REUSE
  let effectiveDecision = candidate.acquisitionDecision || decision.decision;
  let custodyMode = candidate.custodyMode || decision.custodyMode;
  let canAcquire = candidate.canAcquire ?? decision.canAcquire;

  if (opts.forceReference) {
    effectiveDecision = ACQUISITION_DECISION.REFERENCE_ONLY;
    custodyMode = 'REFERENCE_ONLY';
    canAcquire = true; // index as reference
  }

  if (
    effectiveDecision === ACQUISITION_DECISION.BLOCKED ||
    effectiveDecision === ACQUISITION_DECISION.INDEX_ONLY
  ) {
    recordMediaAcquisitionEvent('acquisition_blocked', {
      provider: candidate.provider,
      decision: effectiveDecision,
    });
    return { ok: false, error: 'acquisition_blocked', decision: effectiveDecision };
  }

  if (
    !opts.forceReference &&
    (effectiveDecision === ACQUISITION_DECISION.MANUAL_REVIEW ||
      effectiveDecision === ACQUISITION_DECISION.REFERENCE_ONLY) &&
    !canAcquire &&
    candidate.queueStatus !== 'APPROVED' &&
    candidate.queueStatus !== 'REFERENCE'
  ) {
    return {
      ok: false,
      error: 'requires_review',
      decision: effectiveDecision,
      reviewStatus: decision.reviewStatus,
    };
  }

  // Hard block download for discovery-only / reference-only without forceReference index
  if (decision.decision === ACQUISITION_DECISION.BLOCKED) {
    return { ok: false, error: 'blocked_by_policy', decision: decision.decision };
  }

  // Never download binaries in V1 acquire path
  if (decision.canDownload === true && effectiveDecision === ACQUISITION_DECISION.DOWNLOAD_ALLOWED) {
    // Still prefer provider-hosted
    custodyMode = 'PROVIDER_HOSTED';
  }

  const existing = await findAssetByProviderRemoteId(
    prisma,
    candidate.provider,
    candidate.providerAssetId,
  );
  if (existing) {
    recordMediaAcquisitionEvent('acquisition_deduped', {
      provider: candidate.provider,
      providerAssetId: candidate.providerAssetId,
      assetId: existing.id,
    });
    return {
      ok: true,
      deduped: true,
      asset: existing,
      decision: effectiveDecision,
      custodyMode,
    };
  }

  // Secondary URL dedupe
  if (candidate.sourceUrl) {
    const byUrl = await prisma.universalAsset.findFirst({
      where: { sourceUrl: String(candidate.sourceUrl) },
    });
    if (byUrl) {
      return {
        ok: true,
        deduped: true,
        asset: byUrl,
        decision: effectiveDecision,
        custodyMode,
      };
    }
  }

  const classified = classifyOpenMediaLicense(candidate.license);
  const attributionText =
    opts.attributionText || candidate.attributionTextCaptured || candidate.attributionText || null;

  if (
    (effectiveDecision === ACQUISITION_DECISION.DOWNLOAD_WITH_ATTRIBUTION ||
      decision.attributionRequired) &&
    !opts.forceReference &&
    !String(attributionText || '').trim()
  ) {
    return { ok: false, error: 'attribution_required' };
  }

  const hostingMode =
    custodyMode === 'REFERENCE_ONLY' ? HOSTING_MODE.REFERENCE : HOSTING_MODE.REFERENCE;

  const rightsStatus =
    classified.rightsStatus === RIGHTS_STATUS.CLEARED && !opts.forceReference
      ? RIGHTS_STATUS.CLEARED
      : classified.rightsStatus === RIGHTS_STATUS.RESTRICTED
        ? RIGHTS_STATUS.RESTRICTED
        : RIGHTS_STATUS.UNKNOWN;

  const verifiedAt = new Date().toISOString();
  const metadata = {
    providerRemoteId: String(candidate.providerAssetId),
    remoteId: String(candidate.providerAssetId),
    provenance: {
      sourceUrl: candidate.sourceUrl,
      provider: candidate.provider,
      providerAssetId: candidate.providerAssetId,
      creator: candidate.creator,
      license: candidate.license,
      licenseUrl: candidate.licenseUrl,
      attributionText,
      retrievedAt: candidate.retrievedAt,
      verifiedAt,
      rightsDecision: effectiveDecision,
      custodyMode,
      contentHash: null,
      originalSourceMetadata: candidate.sourceMetadata || null,
      acquisitionChannel: 'rich_media_acquisition_v1',
    },
    attribution: attributionText
      ? { text: attributionText, name: candidate.creator, url: candidate.sourceUrl }
      : null,
    creatorLabel: candidate.creator,
    width: candidate.width,
    height: candidate.height,
    durationSec: candidate.duration,
    mimeType: candidate.mimeType,
    streamUrl: candidate.providerHostedUrl || candidate.previewUrl,
    businessUseTags: suggestBusinessUseTags(candidate),
    acquisitionDecision: effectiveDecision,
    custodyMode,
    relevanceScore: candidate.relevanceScore,
    rightsConfidence: candidate.rightsConfidence,
  };

  const created = await createUniversalAsset(prisma, {
    title: candidate.title || `${candidate.provider} asset`,
    description: candidate.description,
    type: mapType(candidate.mediaType),
    provider: candidate.provider,
    sourceUrl: candidate.sourceUrl || candidate.providerHostedUrl,
    license: candidate.license,
    categories: candidate.industryTags || [],
    tags: [...(candidate.tags || []), 'rich-media-acquisition'],
    thumbnail: candidate.previewUrl,
    preview: candidate.providerHostedUrl || candidate.previewUrl,
    metadata,
    rightsStatus: opts.forceReference ? RIGHTS_STATUS.UNKNOWN : rightsStatus,
    hostingMode,
    qualityScore: candidate.qualityScore || 0,
    status: ASSET_STATUS.NORMALIZED,
    ownerId: opts.userId || null,
  });

  if (!created.ok) {
    return created;
  }

  let asset = created.asset;

  // Publish only when cleared and not force-reference; still REFERENCE hosting
  if (
    !opts.skipPublish &&
    !opts.forceReference &&
    rightsStatus === RIGHTS_STATUS.CLEARED &&
    opts.userId
  ) {
    const pub = await publishUniversalAsset(prisma, asset.id);
    if (pub.ok) asset = pub.asset;
  }

  recordMediaAcquisitionEvent('acquisition_persisted', {
    assetId: asset.id,
    provider: candidate.provider,
    decision: effectiveDecision,
    custodyMode,
    rightsStatus: asset.rightsStatus,
  });

  return {
    ok: true,
    deduped: false,
    asset,
    decision: effectiveDecision,
    custodyMode,
    downloaded: false,
    hostingMode: asset.hostingMode,
  };
}

function mapType(mediaType) {
  const m = String(mediaType || 'other').toLowerCase();
  if (m === 'image' || m === 'photo') return 'image';
  if (m === 'video') return 'video';
  if (m === 'audio') return 'audio';
  if (m === 'document') return 'document';
  return 'other';
}

function suggestBusinessUseTags(candidate) {
  const tags = ['MARKETING_ASSET'];
  const mt = candidate.mediaType;
  if (mt === 'image') tags.push('PRODUCT_CARD', 'STORE_HERO', 'SOCIAL_POST');
  if (mt === 'video') tags.push('PROMOTION', 'SIGNAGE', 'LIVE_BACKGROUND');
  if (mt === 'audio') tags.push('LIVE_BACKGROUND');
  return tags;
}
