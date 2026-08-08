/**
 * Project eligible Creator Studio content into Universal Library.
 * Requires explicit Library publication intent — never automatic.
 */

import {
  ASSET_PROVIDER,
  ASSET_STATUS,
  RIGHTS_STATUS,
} from './universalAssetTypes.js';
import { createUniversalAsset, publishUniversalAsset } from './universalAssetService.js';
import { CATALOGUE_QUALITY, CONTENT_ORIGIN } from './contentOrigin.js';

/** Phase 3B access modes */
export const LIBRARY_ACCESS_MODE = Object.freeze({
  FREE_TO_USE: 'FREE_TO_USE',
  FREE_WITH_ATTRIBUTION: 'FREE_WITH_ATTRIBUTION',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
  PREMIUM_COMING_SOON: 'PREMIUM_COMING_SOON',
});

const LEGACY_INTENT_MAP = Object.freeze({
  free: LIBRARY_ACCESS_MODE.FREE_TO_USE,
  attribution: LIBRARY_ACCESS_MODE.FREE_WITH_ATTRIBUTION,
  reference: LIBRARY_ACCESS_MODE.REFERENCE_ONLY,
  premium: LIBRARY_ACCESS_MODE.PREMIUM_COMING_SOON,
});

function resolveAccessMode(input) {
  const raw = String(input.accessMode || input.libraryIntent || '').trim();
  if (LIBRARY_ACCESS_MODE[raw]) return LIBRARY_ACCESS_MODE[raw];
  if (LEGACY_INTENT_MAP[raw]) return LEGACY_INTENT_MAP[raw];
  return null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function projectCreatorContentToLibrary(prisma, input = {}) {
  const creatorId = String(input.creatorId || '').trim();
  const title = String(input.title || input.libraryTitle || '').trim();
  const accessMode = resolveAccessMode(input);
  if (!creatorId || !title) {
    return { ok: false, error: 'creatorId_and_title_required', status: 400 };
  }
  if (!accessMode) {
    return { ok: false, error: 'invalid_access_mode', status: 400 };
  }
  if (!input.rightsDeclaration && !input.rightsAcknowledged && !input.allowPilot) {
    return { ok: false, error: 'rights_declaration_required', status: 400 };
  }
  if (
    !input.withdrawalPolicyAcknowledged &&
    input.requireWithdrawalAck !== false &&
    !input.allowPilot
  ) {
    return { ok: false, error: 'withdrawal_policy_ack_required', status: 400 };
  }
  if (input.private === true || input.unpublished === true) {
    return { ok: false, error: 'private_content_cannot_project', status: 403 };
  }
  if (String(input.rightsStatus || '').toUpperCase() === 'UNKNOWN') {
    return { ok: false, error: 'unknown_rights_fail_closed', status: 403 };
  }
  if (accessMode === LIBRARY_ACCESS_MODE.PREMIUM_COMING_SOON && !input.marketplaceListingId) {
    // May create draft listing metadata only — never activate purchase
    if (!input.allowPremiumDraft) {
      return { ok: false, error: 'premium_requires_listing_or_draft_flag', status: 400 };
    }
  }

  const creatorContentId = input.creatorContentId || null;
  if (creatorContentId) {
    const dup = await prisma.universalAsset.findMany({
      where: { provider: ASSET_PROVIDER.CREATOR_STUDIO, creatorId },
      take: 500,
    });
    const already = dup.find((a) => {
      const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      return m.creatorContentId === creatorContentId && a.status !== ASSET_STATUS.WITHDRAWN;
    });
    if (already) {
      return { ok: true, skipped: true, assetId: already.id, reason: 'already_projected' };
    }
  }

  const existing = await prisma.universalAsset.findFirst({
    where: {
      creatorId,
      title,
      provider: ASSET_PROVIDER.CREATOR_STUDIO,
    },
  });
  if (existing && existing.status !== ASSET_STATUS.WITHDRAWN) {
    return { ok: true, skipped: true, assetId: existing.id, reason: 'already_projected' };
  }

  const referenceOnly = accessMode === LIBRARY_ACCESS_MODE.REFERENCE_ONLY;
  const premiumComingSoon = accessMode === LIBRARY_ACCESS_MODE.PREMIUM_COMING_SOON;
  const attribution =
    accessMode === LIBRARY_ACCESS_MODE.FREE_WITH_ATTRIBUTION
      ? {
          required: true,
          text: input.attributionRequirements || `Credit ${input.creatorLabel || creatorId}`,
        }
      : null;

  const created = await createUniversalAsset(prisma, {
    title,
    description: input.description || null,
    type: String(input.type || 'image').toLowerCase(),
    provider: ASSET_PROVIDER.CREATOR_STUDIO,
    categories: input.categories || [],
    tags: input.tags || ['creator-studio'],
    license:
      accessMode === LIBRARY_ACCESS_MODE.FREE_WITH_ATTRIBUTION
        ? 'creator-attribution'
        : accessMode === LIBRARY_ACCESS_MODE.FREE_TO_USE
          ? 'creator-free'
          : premiumComingSoon
            ? 'premium-coming-soon'
            : 'reference-only',
    thumbnail: input.preview || input.thumbnail || null,
    preview: input.preview || input.thumbnail || null,
    ownerId: creatorId,
    creatorId,
    rightsStatus: RIGHTS_STATUS.CLEARED,
    hostingMode: referenceOnly ? 'REFERENCE' : 'HOSTED',
    status: ASSET_STATUS.NORMALIZED,
    qualityScore: Number(input.qualityScore) || 70,
    sourceUrl: input.sourceUrl || null,
    metadata: {
      contentOrigin: referenceOnly
        ? CONTENT_ORIGIN.REFERENCE_ONLY
        : CONTENT_ORIGIN.REAL_CREATOR,
      catalogueQualityStatus: input.submitForReview
        ? CATALOGUE_QUALITY.NEEDS_REVIEW
        : CATALOGUE_QUALITY.APPROVED,
      accessMode,
      libraryIntent: accessMode,
      creatorContentId,
      industry: input.industry || null,
      useCases: input.useCases || input.intendedUse ? [input.intendedUse].filter(Boolean) : [],
      intendedUse: input.intendedUse || null,
      rightsDeclaration: input.rightsDeclaration || true,
      attributionRequirements: input.attributionRequirements || null,
      attribution,
      aiGeneratedDisclosure: Boolean(input.aiGeneratedDisclosure),
      withdrawalPolicyAcknowledged: Boolean(input.withdrawalPolicyAcknowledged),
      verifiedType: input.creatorVerified ? 'CREATOR_IDENTITY_VERIFIED' : null,
      provenance: {
        source: 'creator_studio',
        creatorContentId,
        projectedAt: new Date().toISOString(),
        creatorId,
      },
      creatorLabel: input.creatorLabel || creatorId,
      creatorVerified: Boolean(input.creatorVerified),
      // Premium purchase never active in this phase
      premium: false,
      premiumComingSoon,
      marketplaceListingId: input.marketplaceListingId || null,
      purchaseAvailable: false,
      openLicense:
        accessMode === LIBRARY_ACCESS_MODE.FREE_TO_USE ||
        accessMode === LIBRARY_ACCESS_MODE.FREE_WITH_ATTRIBUTION,
      syntheticEngagement: false,
      views: 0,
      downloads: 0,
      rating: null,
    },
  });

  if (!created.ok) return created;

  if (referenceOnly || input.submitForReview) {
    return {
      ok: true,
      assetId: created.asset.id,
      published: false,
      referenceOnly,
      underReview: Boolean(input.submitForReview),
      purchaseAvailable: false,
    };
  }

  const pub = await publishUniversalAsset(prisma, created.asset.id);
  return {
    ok: Boolean(pub.ok),
    assetId: created.asset.id,
    published: Boolean(pub.ok),
    purchaseAvailable: false,
    error: pub.error,
  };
}

/**
 * Withdraw Library projection — preserves provenance / audit in metadata.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function withdrawCreatorLibraryProjection(prisma, input = {}) {
  const assetId = String(input.assetId || '').trim();
  const creatorId = String(input.creatorId || '').trim();
  if (!assetId) return { ok: false, error: 'assetId_required', status: 400 };

  const asset = await prisma.universalAsset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, error: 'not_found', status: 404 };
  if (asset.provider !== ASSET_PROVIDER.CREATOR_STUDIO) {
    return { ok: false, error: 'not_creator_projection', status: 400 };
  }
  if (creatorId && asset.creatorId !== creatorId) {
    return { ok: false, error: 'creator_mismatch', status: 403 };
  }

  const meta = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  await prisma.universalAsset.update({
    where: { id: assetId },
    data: {
      status: ASSET_STATUS.WITHDRAWN,
      metadata: {
        ...meta,
        withdrawnAt: new Date().toISOString(),
        withdrawnReason: input.reason || 'creator_withdrawal',
        provenance: {
          ...(meta.provenance && typeof meta.provenance === 'object' ? meta.provenance : {}),
          withdrawnAt: new Date().toISOString(),
          priorStatus: asset.status,
        },
      },
    },
  });

  return { ok: true, assetId, withdrawn: true, creatorId: asset.creatorId };
}
