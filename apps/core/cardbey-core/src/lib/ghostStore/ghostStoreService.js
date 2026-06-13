/**
 * Ghost store creation, dedup, claim, and report lifecycle.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../prisma.js';
import { hasBusinessColumn } from '../businessColumnCapabilities.js';
import { safePublishGeneratedDraft } from '../storeMission/safePublishGeneratedDraft.js';
import { writeEpisodicEventAsync } from '../memory/episodicWriter.js';
import { buildGhostStorePreview } from './ghostStorePreviewBuilder.js';
import {
  findGhostStoreDuplicate,
  matchStoreByVisionExtraction,
} from './storeMatchByVision.js';
import { enrichGhostStoreAsync } from './ghostStoreEnrichment.js';

const VALID_REPORT_REASONS = new Set(['inaccurate', 'not_my_business', 'offensive', 'other']);

function systemUserId() {
  return process.env.DISCOVERY_SYSTEM_USER_ID?.trim() || null;
}

function ghostFieldsPatch(extra = {}) {
  if (!hasBusinessColumn('provenance')) return {};
  return {
    provenance: 'consumer_capture',
    claimStatus: 'unclaimed',
    captureCount: 1,
    ...extra,
  };
}

/**
 * @param {string} storeId
 * @param {{ visionEventId?: string; userId?: string | null }} meta
 */
async function incrementGhostCaptureCount(storeId, meta = {}) {
  const prisma = getPrismaClient();
  const data = { captureCount: { increment: 1 } };
  if (hasBusinessColumn('capturedByUserId') && meta.userId) {
    data.capturedByUserId = meta.userId;
  }
  await prisma.business.update({ where: { id: storeId }, data });
  writeEpisodicEventAsync({
    userId: meta.userId ?? systemUserId(),
    missionId: meta.visionEventId ?? null,
    type: 'ghost_store_sighting',
    payload: { storeId, visionEventId: meta.visionEventId ?? null, deduped: true },
  });
}

/**
 * @param {object} input
 * @param {object} [input.extraction]
 * @param {{ lat?: number; lng?: number } | null} [input.location]
 * @param {string} [input.visionEventId]
 * @param {string[]} [input.imagePaths]
 * @param {string | null} [input.userId]
 * @param {string | null} [input.missionId]
 */
export async function createGhostStore(input = {}) {
  const extraction = input.extraction && typeof input.extraction === 'object' ? input.extraction : {};
  const location = input.location && typeof input.location === 'object' ? input.location : null;
  const userId = typeof input.userId === 'string' ? input.userId.trim() : null;
  const visionEventId = typeof input.visionEventId === 'string' ? input.visionEventId.trim() : null;
  const imagePaths = Array.isArray(input.imagePaths) ? input.imagePaths.filter(Boolean) : [];
  const heroImageUrl = imagePaths[0] ?? null;

  const matchedPublic = await matchStoreByVisionExtraction(extraction.businessName, location);
  if (matchedPublic) {
    await incrementGhostCaptureCount(matchedPublic.id, { visionEventId, userId });
    return {
      action: 'open_store',
      storeId: matchedPublic.id,
      slug: matchedPublic.slug,
      deduped: true,
    };
  }

  const ghostDup = await findGhostStoreDuplicate(extraction.businessName, location);
  if (ghostDup) {
    await incrementGhostCaptureCount(ghostDup.id, { visionEventId, userId });
    return {
      action: 'open_store',
      storeId: ghostDup.id,
      slug: ghostDup.slug,
      deduped: true,
    };
  }

  const ownerId = systemUserId();
  if (!ownerId) {
    return {
      action: 'unsupported',
      message: 'Ghost store creation is not configured (DISCOVERY_SYSTEM_USER_ID missing).',
    };
  }

  const prisma = getPrismaClient();
  const preview = buildGhostStorePreview({ extraction, location, heroImageUrl });
  const draft = await prisma.draftStore.create({
    data: {
      mode: 'template',
      status: 'ready',
      ownerUserId: ownerId,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      brandTone: extraction.brandTone ?? null,
      brandColors: Array.isArray(extraction.brandColors)
        ? JSON.stringify(extraction.brandColors)
        : null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      address: extraction.visibleAddress?.trim() || null,
      phone: extraction.visiblePhone?.trim() || null,
      input: {
        businessName: preview.storeName,
        businessType: preview.storeType,
        source: 'consumer_capture',
        visionEventId,
        imagePaths,
        extraction,
        location,
      },
      preview,
      publishSnapshot: preview,
      publishSnapshotVersion: 1,
    },
  });

  const published = await safePublishGeneratedDraft({
    prisma,
    draftId: draft.id,
    userId: ownerId,
    missionId: input.missionId ?? visionEventId ?? null,
  });

  if (!published.ok || !published.storeId) {
    return {
      action: 'unsupported',
      message: published.error ?? 'Failed to publish ghost store.',
    };
  }

  const ghostPatch = ghostFieldsPatch({
    capturedByUserId: userId,
    lat: location?.lat ?? undefined,
    lng: location?.lng ?? undefined,
    address: extraction.visibleAddress?.trim() || undefined,
    phone: extraction.visiblePhone?.trim() || undefined,
    tagline: extraction.tagline?.trim() || undefined,
    primaryColor: preview.brandColors?.primary,
  });
  if (Object.keys(ghostPatch).length > 0) {
    await prisma.business.update({
      where: { id: published.storeId },
      data: ghostPatch,
    });
  }

  enrichGhostStoreAsync({
    storeId: published.storeId,
    extraction,
    location,
    heroImageUrl,
    capturedImagePaths: imagePaths,
  });

  writeEpisodicEventAsync({
    userId: userId ?? ownerId,
    missionId: input.missionId ?? visionEventId ?? null,
    type: 'ghost_store_created',
    payload: {
      storeId: published.storeId,
      slug: published.storeSlug,
      visionEventId,
    },
  });

  return {
    action: 'open_store',
    storeId: published.storeId,
    slug: published.storeSlug,
    ghost: true,
  };
}

/**
 * @param {string} storeId
 * @param {object} body
 */
export async function submitGhostStoreClaim(storeId, body = {}) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, claimStatus: true, provenance: true },
  });
  if (!store || store.provenance !== 'consumer_capture') {
    return { ok: false, code: 'not_found', message: 'Store not found or not claimable.' };
  }
  if (store.claimStatus === 'claimed' || store.claimStatus === 'removed') {
    return { ok: false, code: 'not_claimable', message: 'This store cannot be claimed.' };
  }

  const claimantName = String(body.claimantName ?? '').trim();
  const claimantEmail = String(body.claimantEmail ?? '').trim().toLowerCase();
  if (!claimantName || !claimantEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail)) {
    return { ok: false, code: 'validation_error', message: 'Valid name and email are required.' };
  }

  const claim = await prisma.ghostStoreClaim.create({
    data: {
      id: randomUUID(),
      storeId,
      claimantName,
      claimantEmail,
      claimantPhone: body.claimantPhone?.trim() || null,
      claimantRole: body.claimantRole?.trim() || null,
      message: body.message?.trim() || null,
      status: 'pending',
    },
  });

  if (hasBusinessColumn('claimStatus')) {
    await prisma.business.update({
      where: { id: storeId },
      data: { claimStatus: 'claim_pending' },
    });
  }

  return { ok: true, claimId: claim.id, status: 'pending' };
}

/**
 * @param {string} storeId
 * @param {object} body
 */
export async function submitGhostStoreReport(storeId, body = {}) {
  const prisma = getPrismaClient();
  const reason = String(body.reason ?? '').trim().toLowerCase();
  if (!VALID_REPORT_REASONS.has(reason)) {
    return { ok: false, code: 'validation_error', message: 'Invalid report reason.' };
  }

  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, claimStatus: true },
  });
  if (!store) {
    return { ok: false, code: 'not_found', message: 'Store not found.' };
  }

  await prisma.ghostStoreReport.create({
    data: {
      id: randomUUID(),
      storeId,
      reason,
      detail: body.detail?.trim() || null,
      status: 'open',
    },
  });

  const openCount = await prisma.ghostStoreReport.count({
    where: { storeId, status: 'open' },
  });

  if (openCount >= 3 && hasBusinessColumn('claimStatus')) {
    await prisma.business.update({
      where: { id: storeId },
      data: { claimStatus: 'removed', isActive: false },
    });
  }

  return { ok: true, openReportCount: openCount, removed: openCount >= 3 };
}

/**
 * @param {string} email
 * @returns {Promise<{ status: 'verified' | 'unverified' | 'not_registered'; user: { id: string; emailVerified: boolean } | null }>}
 */
export async function resolveClaimantAccountStatus(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!normalized) {
    return { status: 'not_registered', user: null };
  }

  const prisma = getPrismaClient();
  const user = await prisma.user.findFirst({
    where: { email: normalized },
    select: { id: true, emailVerified: true },
  });

  if (!user) return { status: 'not_registered', user: null };
  if (user.emailVerified !== true) return { status: 'unverified', user };
  return { status: 'verified', user };
}

/**
 * @param {object} claim
 */
export async function enrichGhostClaimForAdmin(claim) {
  const account = await resolveClaimantAccountStatus(claim.claimantEmail);
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: claim.storeId },
    select: { id: true, name: true, slug: true, claimStatus: true },
  });

  return {
    ...claim,
    store,
    claimantAccountStatus: account.status,
    transferReady: account.status === 'verified',
    reviewerHint:
      account.status === 'verified'
        ? 'Verified Cardbey account — approval will transfer ownership immediately.'
        : account.status === 'unverified'
          ? 'Account exists but email is not verified — approval will defer transfer until verification.'
          : 'No Cardbey account with this email — approval will defer transfer until they register and verify.',
  };
}

/**
 * @param {{ status?: string }} [query]
 */
export async function listGhostClaims(query = {}) {
  const prisma = getPrismaClient();
  const status = typeof query.status === 'string' ? query.status.trim() : 'pending';
  const claims = await prisma.ghostStoreClaim.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  return Promise.all(claims.map((claim) => enrichGhostClaimForAdmin(claim)));
}

/**
 * Transfer ownership for approved_pending_account claims when email is verified.
 * @param {string} userId
 */
export async function completePendingGhostClaimsForUser(userId) {
  const uid = String(userId ?? '').trim();
  if (!uid || !hasBusinessColumn('claimStatus')) return { completed: 0 };

  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user?.email || user.emailVerified !== true) return { completed: 0 };

  const email = user.email.trim().toLowerCase();
  const pending = await prisma.ghostStoreClaim.findMany({
    where: { claimantEmail: email, status: 'approved_pending_account' },
    take: 20,
  });

  let completed = 0;
  for (const claim of pending) {
    await prisma.business.update({
      where: { id: claim.storeId },
      data: {
        userId: user.id,
        claimStatus: 'claimed',
        provenance: 'owner',
      },
    });
    await prisma.ghostStoreClaim.update({
      where: { id: claim.id },
      data: { status: 'approved', reviewedAt: new Date() },
    });
    completed += 1;
  }

  return { completed };
}

/**
 * @param {string} claimId
 * @param {{ decision: 'approved' | 'rejected'; reviewerNote?: string }} body
 * @param {string} reviewerUserId
 */
export async function reviewGhostClaim(claimId, body, reviewerUserId) {
  const prisma = getPrismaClient();
  const decision = body.decision === 'approved' ? 'approved' : 'rejected';
  const claim = await prisma.ghostStoreClaim.findUnique({ where: { id: claimId } });
  if (!claim || claim.status !== 'pending') {
    return { ok: false, code: 'not_found', message: 'Claim not found or already reviewed.' };
  }

  const account = await resolveClaimantAccountStatus(claim.claimantEmail);

  if (decision === 'rejected') {
    await prisma.ghostStoreClaim.update({
      where: { id: claimId },
      data: {
        status: 'rejected',
        reviewerNote: body.reviewerNote?.trim() || null,
        reviewedAt: new Date(),
      },
    });
    if (hasBusinessColumn('claimStatus')) {
      await prisma.business.update({
        where: { id: claim.storeId },
        data: { claimStatus: 'unclaimed' },
      });
    }
    writeEpisodicEventAsync({
      userId: reviewerUserId,
      missionId: null,
      type: 'ghost_claim_reviewed',
      payload: { claimId, storeId: claim.storeId, decision: 'rejected' },
    });
    return {
      ok: true,
      decision: 'rejected',
      transferOutcome: 'none',
      claimantAccountStatus: account.status,
      storeId: claim.storeId,
    };
  }

  // Approved path — immediate transfer only for verified accounts.
  if (account.status === 'verified' && account.user) {
    await prisma.ghostStoreClaim.update({
      where: { id: claimId },
      data: {
        status: 'approved',
        reviewerNote: body.reviewerNote?.trim() || null,
        reviewedAt: new Date(),
      },
    });
    if (hasBusinessColumn('claimStatus')) {
      await prisma.business.update({
        where: { id: claim.storeId },
        data: {
          userId: account.user.id,
          claimStatus: 'claimed',
          provenance: 'owner',
        },
      });
    }
    writeEpisodicEventAsync({
      userId: reviewerUserId,
      missionId: null,
      type: 'ghost_claim_reviewed',
      payload: { claimId, storeId: claim.storeId, decision: 'approved', transferOutcome: 'completed' },
    });
    return {
      ok: true,
      decision: 'approved',
      transferOutcome: 'completed',
      claimantAccountStatus: account.status,
      storeId: claim.storeId,
      newOwnerUserId: account.user.id,
    };
  }

  const reviewerMessage =
    account.status === 'unverified'
      ? 'Claimant has a Cardbey account but email is not verified. Ownership will transfer automatically when they verify.'
      : 'No Cardbey account with this email yet. Ask the claimant to register with this email and verify it; ownership will transfer then.';

  await prisma.ghostStoreClaim.update({
    where: { id: claimId },
    data: {
      status: 'approved_pending_account',
      reviewerNote: body.reviewerNote?.trim() || reviewerMessage,
      reviewedAt: new Date(),
    },
  });

  writeEpisodicEventAsync({
    userId: reviewerUserId,
    missionId: null,
    type: 'ghost_claim_reviewed',
    payload: {
      claimId,
      storeId: claim.storeId,
      decision: 'approved',
      transferOutcome: 'approved_pending_account',
      claimantAccountStatus: account.status,
    },
  });

  return {
    ok: true,
    decision: 'approved',
    transferOutcome: 'approved_pending_account',
    claimantAccountStatus: account.status,
    reviewerMessage,
    storeId: claim.storeId,
  };
}

/**
 * @param {string} storeId
 */
export async function listEnrichedFieldProvenance(storeId) {
  const prisma = getPrismaClient();
  return prisma.enrichedFieldProvenance.findMany({
    where: { storeId },
    orderBy: { fetchedAt: 'desc' },
  });
}
