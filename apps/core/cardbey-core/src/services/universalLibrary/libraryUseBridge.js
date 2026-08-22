/**
 * Universal Library → URI reuse bridge.
 * Maps a published UniversalAsset into URI select → revalidate → confirm → draft.
 * Does not download provider binaries. Does not publish live destinations.
 */

import { Features } from '../../config/features.js';
import { getUniversalAsset } from './universalAssetService.js';
import { resolvePublicStreamUrl, safePublicMediaUrl } from './publicAssetView.js';
import { ASSET_STATUS, HOSTING_MODE, RIGHTS_STATUS } from './universalAssetTypes.js';
import {
  selectResourceCandidate,
  confirmAndExecuteReuse,
  ensureFederationReady,
} from '../universalResourceIntelligence/index.js';
import {
  createSearchSession,
  insertCandidateSnapshots,
} from '../universalResourceIntelligence/reuseRepository.js';
import { upsertResourceRecord } from '../universalResourceIntelligence/resourceIndex.js';
import {
  CUSTODY_MODE,
  DESTINATION_ADAPTER,
} from '../universalResourceIntelligence/types.js';
import { explainCandidate } from '../universalResourceIntelligence/candidateExplainer.js';
import { evaluateResourceRights } from '../universalResourceIntelligence/rightsIntelligence.js';

/** @type {Record<string, string>} */
export const LIBRARY_USE_DESTINATION = Object.freeze({
  display: DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT,
  promotion: DESTINATION_ADAPTER.PROMOTION_DRAFT,
  website: DESTINATION_ADAPTER.STOREFRONT_HERO_DRAFT,
  social: DESTINATION_ADAPTER.SOCIAL_CONTENT_DRAFT,
  performer: 'performer_conversation',
});

function uriReuseReady() {
  return Boolean(
    Features.universalResourceIntelligence?.v1 &&
      Features.universalResourceIntelligence?.reusePilotV1,
  );
}

function mapProviderToSourceId(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'pexels') return 'src_pexels';
  if (p === 'cardbey_internal') return 'src_cardbey_originals';
  if (p === 'pixabay') return 'src_pixabay';
  if (p === 'unsplash') return 'src_unsplash';
  if (p === 'openverse') return 'src_openverse';
  if (p === 'wikimedia' || p === 'wikimedia_commons') return 'src_wikimedia';
  return `src_${p || 'unknown'}`;
}

/**
 * Fail-closed local gate before URI journey.
 * @param {object} asset
 */
export function evaluateLibraryAssetReuse(asset) {
  if (!asset) return { ok: false, blocked: true, code: 'ASSET_NOT_FOUND', message: 'Resource not found.' };
  if (String(asset.status).toUpperCase() !== ASSET_STATUS.PUBLISHED) {
    return {
      ok: false,
      blocked: true,
      code: 'NOT_PUBLISHED',
      message: 'This resource is not published in the catalogue.',
    };
  }
  const rights = String(asset.rightsStatus || '').toUpperCase();
  if (rights === RIGHTS_STATUS.REJECTED || rights === RIGHTS_STATUS.RESTRICTED) {
    return {
      ok: false,
      blocked: true,
      code: 'RIGHTS_BLOCKED',
      message: 'Rights do not allow reuse of this resource.',
      rightsStatus: rights,
    };
  }
  if (rights && rights !== RIGHTS_STATUS.CLEARED && rights !== 'UNKNOWN' && rights !== '') {
    return {
      ok: false,
      blocked: true,
      code: 'NEEDS_REVIEW',
      message: 'Rights need review before this resource can be used.',
      rightsStatus: rights,
    };
  }
  if (!asset.ownerId) {
    return {
      ok: false,
      blocked: true,
      code: 'OWNERSHIP_MISSING',
      message: 'Resource ownership is incomplete; reuse is blocked.',
    };
  }
  return { ok: true, blocked: false, rightsStatus: rights || RIGHTS_STATUS.CLEARED };
}

/**
 * @param {object} asset
 */
export function universalAssetToUriResource(asset) {
  const meta = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  const streamUrl = resolvePublicStreamUrl(asset, meta);
  const preview =
    safePublicMediaUrl(asset.preview) ||
    safePublicMediaUrl(asset.thumbnail) ||
    streamUrl;
  const canonical =
    safePublicMediaUrl(asset.sourceUrl) ||
    safePublicMediaUrl(meta.canonicalUrl) ||
    preview;
  const provider = String(asset.provider || '').toLowerCase();
  const sourceId = mapProviderToSourceId(provider);
  const hosting = String(asset.hostingMode || HOSTING_MODE.REFERENCE).toUpperCase();
  const custodyMode =
    hosting === HOSTING_MODE.REFERENCE || hosting === HOSTING_MODE.EXTERNAL
      ? CUSTODY_MODE.PROVIDER_HOSTED
      : provider === 'cardbey_internal'
        ? CUSTODY_MODE.PROVIDER_HOSTED
        : CUSTODY_MODE.PROVIDER_HOSTED;

  return {
    id: `ul_${asset.id}`,
    remoteId: String(meta.remoteId || asset.id),
    sourceId,
    provider,
    title: asset.title,
    kind: String(asset.type || 'image').toLowerCase(),
    mediaType: String(asset.type || 'image').toLowerCase(),
    previewUrl: preview,
    url: streamUrl || preview,
    downloadUrl: null, // never force provider download for Use V1
    canonicalUrl: canonical,
    license: asset.license || meta.license || null,
    photographer: meta.creatorLabel || meta.photographer || null,
    photographerUrl: meta.photographerUrl || null,
    attributionText:
      meta.creatorLabel || meta.photographer
        ? `${asset.type === 'video' ? 'Video' : 'Photo'} by ${meta.creatorLabel || meta.photographer}${
            provider === 'pexels' ? ' on Pexels' : ''
          }`
        : asset.license || provider,
    custodyMode,
    hostingMode: hosting,
    sourceMetadata: {
      license: asset.license,
      photographer: meta.creatorLabel || meta.photographer || null,
      universalAssetId: asset.id,
      contentOrigin: meta.contentOrigin || null,
    },
    rightsSnapshot: {
      upstreamStatus: asset.rightsStatus || RIGHTS_STATUS.CLEARED,
    },
    provenance: {
      assetId: asset.id,
      universalLibrary: true,
      hostingMode: hosting,
    },
    binaryStored: false,
  };
}

/**
 * Use a Universal Library asset in a destination via URI reuse gate.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   assetId: string,
 *   destination: string,
 *   confirm?: boolean,
 *   userId?: string|null,
 *   storeId?: string|null,
 *   tenantId?: string|null,
 *   draftStoreId?: string|null,
 *   playlistName?: string|null,
 *   websitePlacement?: string|null,
 * }} input
 */
export async function useUniversalLibraryAsset(prisma, input = {}) {
  if (!Features.universalLibrary?.v1) {
    return { ok: false, error: 'universal_library_disabled' };
  }
  if (!uriReuseReady()) {
    return {
      ok: false,
      error: 'uri_reuse_unavailable',
      missing: 'ENABLE_UNIVERSAL_RESOURCE_INTELLIGENCE_V1 + ENABLE_URI_REUSE_PILOT_V1 (Core URI)',
      blocked: true,
    };
  }

  const destinationKey = String(input.destination || '').toLowerCase();
  const destination = LIBRARY_USE_DESTINATION[destinationKey] || input.destination;
  if (!destination) {
    return { ok: false, error: 'destination_required' };
  }

  if (destination === 'performer_conversation') {
    const asset = await getUniversalAsset(prisma, input.assetId);
    if (!asset.ok) return { ok: false, error: asset.error || 'asset_not_found', blocked: true };
    const gate = evaluateLibraryAssetReuse(asset.asset);
    if (!gate.ok) return gate;
    const resource = universalAssetToUriResource(asset.asset);
    return {
      ok: true,
      destination: 'performer_conversation',
      performerHandoff: true,
      published: false,
      resource,
      universalAssetId: asset.asset.id,
      custodyMode: resource.custodyMode,
      binaryStored: false,
      authority: 'universal_library_performer_handoff',
    };
  }

  if (input.confirm !== true) {
    return {
      ok: false,
      error: 'confirmation_required',
      message: 'Use this requires explicit confirmation before creating a draft.',
      awaitingConfirmation: true,
    };
  }

  await ensureFederationReady();

  const loaded = await getUniversalAsset(prisma, input.assetId);
  if (!loaded.ok) return { ok: false, error: loaded.error || 'asset_not_found', blocked: true };
  const gate = evaluateLibraryAssetReuse(loaded.asset);
  if (!gate.ok) return { ...gate, authority: 'universal_library_gate' };

  const resource = universalAssetToUriResource(loaded.asset);
  upsertResourceRecord(resource);

  const session = await createSearchSession(prisma, {
    userId: input.userId || null,
    utterance: `Use Universal Library resource ${loaded.asset.title}`,
    intent: {
      purpose: destinationKey,
      consumer: 'universal_library',
      universalAssetId: loaded.asset.id,
      websitePlacement: input.websitePlacement || null,
    },
    consumer: 'universal_library',
  });

  const explanation = explainCandidate(resource, { purpose: destinationKey });
  const rights = evaluateResourceRights(resource);
  const snaps = await insertCandidateSnapshots(prisma, session.id, [
    { resource, explanation, rights },
  ]);
  const snap = snaps[0];
  if (!snap?.id) {
    return { ok: false, error: 'candidate_snapshot_failed', blocked: true };
  }

  const selected = await selectResourceCandidate(prisma, {
    sessionId: session.id,
    candidateSnapshotId: snap.id,
    custodyMode: resource.custodyMode,
    intendedPurpose: `library_use_${destinationKey}`,
    targetType: destination,
    targetId: input.storeId || input.draftStoreId || null,
    userId: input.userId || null,
  });
  if (!selected.ok) {
    return {
      ok: false,
      error: selected.error || 'uri_select_failed',
      blocked: Boolean(selected.blocked || selected.error),
      details: selected,
      authority: 'universal_resource_intelligence',
    };
  }

  const reuseDecisionId = selected.reuseDecision?.id || selected.reuseDecisionId;
  if (!reuseDecisionId) {
    return {
      ok: false,
      error: 'reuse_decision_missing',
      blocked: true,
      details: selected,
      authority: 'universal_resource_intelligence',
    };
  }

  const confirmed = await confirmAndExecuteReuse(prisma, {
    reuseDecisionId,
    confirm: true,
    custodyMode: resource.custodyMode,
    destination,
    userId: input.userId || null,
    tenantId: input.tenantId || 'uri-pilot',
    storeId: input.storeId || 'uri-pilot-draft',
    draftStoreId: input.draftStoreId || null,
    playlistName: input.playlistName || `Library — ${loaded.asset.title}`.slice(0, 120),
    revalidationOverrides: { allowMissingIndex: true },
  });

  // confirmAndExecuteReuse uses revalidateSourceAndRights without allowMissingIndex in opts for live check —
  // snapshot with previewUrl should pass. If federation source inactive, surface block.
  if (!confirmed.ok) {
    return {
      ok: false,
      error: confirmed.error || 'uri_reuse_blocked',
      blocked: true,
      message: confirmed.message || confirmed.error,
      details: confirmed,
      authority: 'universal_resource_intelligence',
      binaryStored: false,
    };
  }

  return {
    ok: true,
    published: false,
    destination,
    destinationKey,
    universalAssetId: loaded.asset.id,
    custodyMode: confirmed.custodyMode || resource.custodyMode,
    binaryStored: false,
    draft: confirmed.draft,
    externalResourceUse: confirmed.externalResourceUse,
    attribution: confirmed.attribution,
    sessionId: session.id,
    reuseDecisionId,
    authority: 'universal_resource_intelligence',
    websitePlacement: input.websitePlacement || null,
  };
}
