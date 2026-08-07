import { getPrismaClient } from '../../prisma.js';
import { createMarketplaceError } from '../errors.js';
import { assertMarketplaceCreatorLicenceAllowed } from '../licences.js';
import { logMarketplaceTelemetry } from '../telemetry.js';
import {
  MARKETPLACE_ACCESS_TYPES,
  MARKETPLACE_AVAILABILITY_STATUS,
  MARKETPLACE_LISTING_STATUS,
  MARKETPLACE_SELLER_STATUS,
  MARKETPLACE_SUPPORTED_CURRENCIES,
  buildMarketplaceActiveSourceKey,
  isMarketplaceListingActiveStatus,
} from '../types.js';
import { evaluateMarketplaceListingEligibility } from './listingEligibility.js';
import { assertTransition } from './listingStateMachine.js';
import { appendMarketplaceListingEvent } from './listingAuditService.js';

function normalizeAccessType(value, fallback = MARKETPLACE_ACCESS_TYPES.FREE) {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!Object.values(MARKETPLACE_ACCESS_TYPES).includes(normalized)) {
    throw createMarketplaceError('invalid_access_type', 'Unsupported marketplace access type.', 422);
  }
  return normalized;
}

function normalizeCurrency(value, fallback = 'AUD') {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!MARKETPLACE_SUPPORTED_CURRENCIES.includes(normalized)) {
    throw createMarketplaceError('invalid_currency', 'Unsupported marketplace currency.', 422);
  }
  return normalized;
}

const OWNERSHIP_ALIASES = Object.freeze({
  SELF_CREATED: 'CREATED_BY_ME',
  LICENSED: 'LICENSED_WITH_RESALE_RIGHTS',
  COLLABORATIVE: 'OTHER_REVIEW_REQUIRED',
});

function normalizeOwnershipType(value, fallback = 'CREATED_BY_ME') {
  const raw = String(value || fallback).trim().toUpperCase();
  const normalized = OWNERSHIP_ALIASES[raw] || raw;
  const allowed = new Set([
    'CREATED_BY_ME',
    'CREATED_FOR_ME_WITH_FULL_RIGHTS',
    'LICENSED_WITH_RESALE_RIGHTS',
    'AI_GENERATED_WITH_COMMERCIAL_RIGHTS',
    'OTHER_REVIEW_REQUIRED',
  ]);
  if (!allowed.has(normalized)) {
    throw createMarketplaceError('invalid_ownership_type', 'Ownership type is required.', 422);
  }
  return normalized;
}

function normalizePriceAmount(value, accessType) {
  const parsed = Number(value ?? 0);
  const amount = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  if (accessType === MARKETPLACE_ACCESS_TYPES.FREE) {
    return 0;
  }
  if (amount <= 0) {
    throw createMarketplaceError(
      'invalid_price_amount',
      'Premium marketplace listings require a positive price amount.',
      422,
    );
  }
  return amount;
}

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function normalizeOwnershipDeclaration(input = {}, fallbackOwnershipType) {
  return {
    ownershipType: normalizeOwnershipType(
      input.ownershipType || fallbackOwnershipType,
      fallbackOwnershipType,
    ),
    rightsConfirmed: input.rightsConfirmed === true,
    commercialRightsConfirmed: input.commercialRightsConfirmed === true,
    creatorAuthoredWork: input.creatorAuthoredWork === true,
    declarationText: normalizeText(input.declarationText),
    evidenceJson: Array.isArray(input.evidenceJson) || typeof input.evidenceJson === 'object'
      ? input.evidenceJson
      : null,
  };
}

function normalizeAssetProvenance(input = {}) {
  return {
    sourceKind: String(input.sourceKind || 'CREATOR_SOURCE').trim().toUpperCase(),
    sourceLabel: normalizeText(input.sourceLabel),
    sourceUrl: normalizeText(input.sourceUrl),
    derivativeDisclosure: normalizeText(input.derivativeDisclosure),
    evidenceJson: Array.isArray(input.evidenceJson) || typeof input.evidenceJson === 'object'
      ? input.evidenceJson
      : null,
  };
}

function toListingDto(row) {
  if (!row) return null;
  return {
    listingId: row.id,
    sellerId: row.sellerId,
    creatorId: row.creatorId,
    sourceContentId: row.sourceContentId,
    sourceContentType: row.sourceContentType,
    activeSourceKey: row.activeSourceKey ?? null,
    title: row.title,
    description: row.description ?? null,
    language: row.language ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    accessType: row.accessType,
    priceAmount: row.priceAmount ?? 0,
    currencyCode: row.currencyCode,
    licenceCode: row.licenceCode,
    licenceVersion: row.licenceVersion ?? null,
    customLicenceText: row.customLicenceText ?? null,
    ownershipType: row.ownershipType,
    sellerNotes: row.sellerNotes ?? null,
    reviewReason: row.reviewReason ?? null,
    listingStatus: row.listingStatus,
    availabilityStatus: row.availabilityStatus,
    submittedAt: row.submittedAt ?? null,
    approvedAt: row.approvedAt ?? null,
    approvedByUserId: row.approvedByUserId ?? null,
    publishedAt: row.publishedAt ?? null,
    publishedByUserId: row.publishedByUserId ?? null,
    unpublishedAt: row.unpublishedAt ?? null,
    suspendedAt: row.suspendedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    seller: row.seller
      ? {
          sellerId: row.seller.id,
          status: row.seller.status,
          creatorId: row.seller.creatorId,
        }
      : null,
    creator: row.creator
      ? {
          creatorId: row.creator.id,
          username: row.creator.username,
          displayName: row.creator.displayName ?? null,
        }
      : null,
    sourceContent: row.sourceContent
      ? {
          contentId: row.sourceContent.id,
          creatorId: row.sourceContent.creatorId,
          type: row.sourceContent.type,
          title: row.sourceContent.title,
          description: row.sourceContent.description ?? null,
          language: row.sourceContent.language ?? null,
          durationSeconds: row.sourceContent.durationSeconds ?? null,
          thumbnail: row.sourceContent.thumbnail ?? null,
          mediaUrl: row.sourceContent.mediaUrl ?? null,
          status: row.sourceContent.status,
          visibility: row.sourceContent.visibility ?? null,
          publishedAt: row.sourceContent.publishedAt ?? null,
        }
      : null,
    ownershipDeclaration: row.ownershipDeclaration
      ? {
          ownershipType: row.ownershipDeclaration.ownershipType,
          rightsConfirmed: Boolean(row.ownershipDeclaration.rightsConfirmed),
          commercialRightsConfirmed: Boolean(
            row.ownershipDeclaration.commercialRightsConfirmed,
          ),
          creatorAuthoredWork: Boolean(row.ownershipDeclaration.creatorAuthoredWork),
          declarationText: row.ownershipDeclaration.declarationText ?? null,
          evidenceJson: row.ownershipDeclaration.evidenceJson ?? null,
        }
      : null,
    assetProvenance: row.assetProvenance
      ? {
          sourceKind: row.assetProvenance.sourceKind,
          sourceLabel: row.assetProvenance.sourceLabel ?? null,
          sourceUrl: row.assetProvenance.sourceUrl ?? null,
          derivativeDisclosure: row.assetProvenance.derivativeDisclosure ?? null,
          evidenceJson: row.assetProvenance.evidenceJson ?? null,
        }
      : null,
  };
}

async function getSellerForUser(userId, prisma) {
  const seller = await prisma.marketplaceSellerProfile.findUnique({
    where: { userId },
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });
  if (!seller) {
    throw createMarketplaceError(
      'seller_not_applied',
      'Marketplace seller profile is required before managing listings.',
      404,
    );
  }
  return seller;
}

async function getSourceContentForCreator(prisma, creatorId, sourceContentId) {
  const content = await prisma.creatorContent.findUnique({
    where: { id: sourceContentId },
    select: {
      id: true,
      creatorId: true,
      type: true,
      title: true,
      description: true,
      language: true,
      durationSeconds: true,
      thumbnail: true,
      mediaUrl: true,
      status: true,
      visibility: true,
      publishedAt: true,
    },
  });
  if (!content) {
    throw createMarketplaceError('content_not_found', 'Source creator content was not found.', 404);
  }
  if (String(content.creatorId) !== String(creatorId)) {
    throw createMarketplaceError(
      'content_not_owned',
      'Source creator content does not belong to the authenticated creator.',
      403,
    );
  }
  return content;
}

async function ensureNoActiveSourceConflict(prisma, activeSourceKey, listingId = null) {
  if (!activeSourceKey) return;
  const existing = await prisma.marketplaceListing.findFirst({
    where: {
      activeSourceKey,
      ...(listingId ? { NOT: { id: listingId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw createMarketplaceError(
      'duplicate_active_source',
      'An active marketplace listing already exists for this seller and source content.',
      409,
    );
  }
}

function normalizeCreatorListingInput(input = {}, sourceContent, existing = null) {
  const sourceContentType = String(
    input.sourceContentType || existing?.sourceContentType || sourceContent.type,
  )
    .trim()
    .toUpperCase();
  const accessType = normalizeAccessType(input.accessType, existing?.accessType);
  const currencyCode = normalizeCurrency(input.currencyCode, existing?.currencyCode || 'AUD');
  const priceAmount = normalizePriceAmount(input.priceAmount ?? existing?.priceAmount, accessType);
  const licenceCode = assertMarketplaceCreatorLicenceAllowed(
    input.licenceCode || existing?.licenceCode,
  ).code;
  const ownershipType = normalizeOwnershipType(
    input.ownershipType || existing?.ownershipType,
    'SELF_CREATED',
  );

  return {
    sourceContentType,
    title: normalizeText(input.title) || existing?.title || sourceContent.title,
    description:
      normalizeText(input.description) ?? existing?.description ?? sourceContent.description ?? null,
    language: normalizeText(input.language) || existing?.language || sourceContent.language || null,
    thumbnailUrl:
      normalizeText(input.thumbnailUrl) ||
      existing?.thumbnailUrl ||
      sourceContent.thumbnail ||
      null,
    accessType,
    priceAmount,
    currencyCode,
    licenceCode,
    licenceVersion: normalizeText(input.licenceVersion) || existing?.licenceVersion || 'phase1c',
    customLicenceText: normalizeText(input.customLicenceText),
    ownershipType,
    sellerNotes: normalizeText(input.sellerNotes) ?? existing?.sellerNotes ?? null,
    ownershipDeclaration: normalizeOwnershipDeclaration(
      input.ownershipDeclaration,
      ownershipType,
    ),
    assetProvenance: normalizeAssetProvenance(input.assetProvenance),
  };
}

function hasRightsChange(existing, normalized) {
  const currentOwnership = existing.ownershipDeclaration || {};
  const currentProvenance = existing.assetProvenance || {};
  return Boolean(
    existing.ownershipType !== normalized.ownershipType ||
      existing.licenceCode !== normalized.licenceCode ||
      (existing.customLicenceText || null) !== normalized.customLicenceText ||
      currentOwnership.ownershipType !== normalized.ownershipDeclaration.ownershipType ||
      Boolean(currentOwnership.rightsConfirmed) !==
        Boolean(normalized.ownershipDeclaration.rightsConfirmed) ||
      Boolean(currentOwnership.commercialRightsConfirmed) !==
        Boolean(normalized.ownershipDeclaration.commercialRightsConfirmed) ||
      Boolean(currentOwnership.creatorAuthoredWork) !==
        Boolean(normalized.ownershipDeclaration.creatorAuthoredWork) ||
      (currentOwnership.declarationText || null) !==
        (normalized.ownershipDeclaration.declarationText || null) ||
      (currentProvenance.sourceKind || null) !== normalized.assetProvenance.sourceKind ||
      (currentProvenance.sourceLabel || null) !==
        (normalized.assetProvenance.sourceLabel || null) ||
      (currentProvenance.sourceUrl || null) !==
        (normalized.assetProvenance.sourceUrl || null) ||
      (currentProvenance.derivativeDisclosure || null) !==
        (normalized.assetProvenance.derivativeDisclosure || null)
  );
}

async function upsertListingRelations(prisma, listingId, normalized) {
  await prisma.marketplaceOwnershipDeclaration.upsert({
    where: { listingId },
    update: normalized.ownershipDeclaration,
    create: {
      listingId,
      ...normalized.ownershipDeclaration,
    },
  });
  await prisma.marketplaceAssetProvenance.upsert({
    where: { listingId },
    update: normalized.assetProvenance,
    create: {
      listingId,
      ...normalized.assetProvenance,
    },
  });
}

async function getOwnedListingOrThrow(prisma, listingId, sellerId) {
  const row = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  if (!row) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  if (row.sellerId !== sellerId) {
    throw createMarketplaceError('forbidden', 'Marketplace listing does not belong to this seller.', 403);
  }
  return row;
}

async function transitionListingStatus(
  prisma,
  existing,
  nextStatus,
  actorRole,
  context = {},
  extraData = {},
) {
  assertTransition(existing.listingStatus, nextStatus, actorRole);
  const row = await prisma.marketplaceListing.update({
    where: { id: existing.id },
    data: {
      ...extraData,
      listingStatus: nextStatus,
    },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });

  await appendMarketplaceListingEvent(
    {
      listingId: existing.id,
      eventType: context.eventType || `marketplace_listing_${String(nextStatus).toLowerCase()}`,
      previousStatus: existing.listingStatus,
      newStatus: nextStatus,
      actorUserId: context.actorUserId ?? null,
      actorRole,
      reason: context.reason ?? null,
      metadata: context.metadata ?? null,
    },
    prisma,
  );

  return row;
}

export async function listMyMarketplaceListings(userId, prisma = getPrismaClient()) {
  const seller = await prisma.marketplaceSellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!seller) return [];
  const rows = await prisma.marketplaceListing.findMany({
    where: { sellerId: seller.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  return rows.map(toListingDto);
}

export async function createMarketplaceListingDraft(
  userId,
  input = {},
  prisma = getPrismaClient(),
) {
  const seller = await getSellerForUser(userId, prisma);
  if (seller.status !== MARKETPLACE_SELLER_STATUS.APPROVED) {
    throw createMarketplaceError(
      'seller_not_approved',
      'Only approved marketplace sellers may create listing drafts.',
      403,
    );
  }
  const sourceContentId = String(input.sourceContentId || '').trim();
  if (!sourceContentId) {
    throw createMarketplaceError('source_content_required', 'sourceContentId is required.', 422);
  }
  const sourceContent = await getSourceContentForCreator(prisma, seller.creatorId, sourceContentId);
  const normalized = normalizeCreatorListingInput(input, sourceContent);
  const activeSourceKey = buildMarketplaceActiveSourceKey(
    seller.id,
    normalized.sourceContentType,
    sourceContentId,
  );
  await ensureNoActiveSourceConflict(prisma, activeSourceKey);

  const row = await prisma.marketplaceListing.create({
    data: {
      sellerId: seller.id,
      creatorId: seller.creatorId,
      sourceContentId,
      sourceContentType: normalized.sourceContentType,
      activeSourceKey,
      title: normalized.title,
      description: normalized.description,
      language: normalized.language,
      thumbnailUrl: normalized.thumbnailUrl,
      accessType: normalized.accessType,
      priceAmount: normalized.priceAmount,
      currencyCode: normalized.currencyCode,
      licenceCode: normalized.licenceCode,
      licenceVersion: normalized.licenceVersion,
      customLicenceText: normalized.customLicenceText,
      ownershipType: normalized.ownershipType,
      sellerNotes: normalized.sellerNotes,
      listingStatus: MARKETPLACE_LISTING_STATUS.DRAFT,
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
    },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });

  await upsertListingRelations(prisma, row.id, normalized);
  const detail = await getOwnedListingOrThrow(prisma, row.id, seller.id);
  await appendMarketplaceListingEvent(
    {
      listingId: row.id,
      eventType: 'marketplace_listing_draft_created',
      previousStatus: null,
      newStatus: MARKETPLACE_LISTING_STATUS.DRAFT,
      actorUserId: userId,
      actorRole: 'creator',
    },
    prisma,
  );
  return toListingDto(detail);
}

export async function getMyMarketplaceListing(userId, listingId, prisma = getPrismaClient()) {
  const seller = await getSellerForUser(userId, prisma);
  const row = await getOwnedListingOrThrow(prisma, listingId, seller.id);
  return toListingDto(row);
}

export async function updateMarketplaceListingDraft(
  userId,
  listingId,
  input = {},
  prisma = getPrismaClient(),
) {
  const seller = await getSellerForUser(userId, prisma);
  const existing = await getOwnedListingOrThrow(prisma, listingId, seller.id);
  if (existing.listingStatus === MARKETPLACE_LISTING_STATUS.ARCHIVED) {
    throw createMarketplaceError('invalid_transition', 'Archived listings cannot be updated.', 422);
  }

  const sourceContentId = String(
    input.sourceContentId || existing.sourceContentId,
  ).trim();
  const sourceContent = await getSourceContentForCreator(prisma, seller.creatorId, sourceContentId);
  const normalized = normalizeCreatorListingInput(input, sourceContent, existing);
  const nextActiveSourceKey = isMarketplaceListingActiveStatus(existing.listingStatus)
    ? buildMarketplaceActiveSourceKey(seller.id, normalized.sourceContentType, sourceContentId)
    : null;
  await ensureNoActiveSourceConflict(prisma, nextActiveSourceKey, existing.id);

  const rightsChanged =
    [MARKETPLACE_LISTING_STATUS.APPROVED, MARKETPLACE_LISTING_STATUS.PUBLISHED].includes(
      existing.listingStatus,
    ) && hasRightsChange(existing, normalized);

  let row = await prisma.marketplaceListing.update({
    where: { id: existing.id },
    data: {
      sourceContentId,
      sourceContentType: normalized.sourceContentType,
      activeSourceKey: nextActiveSourceKey,
      title: normalized.title,
      description: normalized.description,
      language: normalized.language,
      thumbnailUrl: normalized.thumbnailUrl,
      accessType: normalized.accessType,
      priceAmount: normalized.priceAmount,
      currencyCode: normalized.currencyCode,
      licenceCode: normalized.licenceCode,
      licenceVersion: normalized.licenceVersion,
      customLicenceText: normalized.customLicenceText,
      ownershipType: normalized.ownershipType,
      sellerNotes: normalized.sellerNotes,
    },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });

  await upsertListingRelations(prisma, existing.id, normalized);

  if (rightsChanged) {
    assertTransition(existing.listingStatus, MARKETPLACE_LISTING_STATUS.SUBMITTED, 'system');
    row = await prisma.marketplaceListing.update({
      where: { id: existing.id },
      data: {
        listingStatus: MARKETPLACE_LISTING_STATUS.SUBMITTED,
        availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
        reviewReason: 'Rights changed after approval; resubmitted for marketplace review.',
        submittedAt: new Date(),
        approvedAt: null,
        approvedByUserId: null,
        publishedAt: null,
        publishedByUserId: null,
        unpublishedAt: null,
      },
      include: {
        seller: true,
        creator: {
          select: { id: true, username: true, displayName: true },
        },
        sourceContent: {
          select: {
            id: true,
            creatorId: true,
            type: true,
            title: true,
            description: true,
            language: true,
            durationSeconds: true,
            thumbnail: true,
            mediaUrl: true,
            status: true,
            visibility: true,
            publishedAt: true,
          },
        },
        ownershipDeclaration: true,
        assetProvenance: true,
      },
    });
    await appendMarketplaceListingEvent(
      {
        listingId: existing.id,
        eventType: 'marketplace_listing_rights_changed_resubmitted',
        previousStatus: existing.listingStatus,
        newStatus: MARKETPLACE_LISTING_STATUS.SUBMITTED,
        actorUserId: userId,
        actorRole: 'system',
        reason: 'rights_changed',
      },
      prisma,
    );
  }

  return toListingDto(row);
}

export async function submitMarketplaceListing(
  userId,
  listingId,
  prisma = getPrismaClient(),
) {
  const seller = await getSellerForUser(userId, prisma);
  const existing = await getOwnedListingOrThrow(prisma, listingId, seller.id);
  const eligibility = evaluateMarketplaceListingEligibility({
    sellerStatus: seller.status,
    creatorId: seller.creatorId,
    content: existing.sourceContent,
  });
  if (!eligibility.eligible) {
    const sellerBlocked = eligibility.reasons.some((reason) => reason.code === 'seller_not_approved');
    throw createMarketplaceError(
      sellerBlocked ? 'seller_not_approved' : 'eligibility_failed',
      'Marketplace listing eligibility requirements were not met.',
      422,
      { reasons: eligibility.reasons },
    );
  }

  if (!existing.ownershipDeclaration?.rightsConfirmed) {
    throw createMarketplaceError(
      'ownership_declaration_required',
      'Ownership declaration with rights confirmation is required before submit.',
      422,
    );
  }
  if (!existing.assetProvenance?.sourceKind) {
    throw createMarketplaceError(
      'provenance_required',
      'Asset provenance is required before submit.',
      422,
    );
  }
  if (
    String(existing.ownershipType || '').toUpperCase() === 'OTHER_REVIEW_REQUIRED' ||
    String(existing.ownershipType || '').toUpperCase() === 'UNKNOWN'
  ) {
    throw createMarketplaceError(
      'unknown_rights',
      'Unknown or review-required ownership cannot be submitted in this phase.',
      422,
    );
  }

  const row = await transitionListingStatus(
    prisma,
    existing,
    MARKETPLACE_LISTING_STATUS.SUBMITTED,
    'creator',
    {
      actorUserId: userId,
      eventType: 'marketplace_listing_submitted',
    },
    {
      submittedAt: new Date(),
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
      reviewReason: null,
      approvedAt: null,
      approvedByUserId: null,
      publishedAt: null,
      publishedByUserId: null,
      unpublishedAt: null,
    },
  );
  return toListingDto(row);
}

export async function unpublishMarketplaceListingForCreator(
  userId,
  listingId,
  prisma = getPrismaClient(),
) {
  const seller = await getSellerForUser(userId, prisma);
  const existing = await getOwnedListingOrThrow(prisma, listingId, seller.id);
  const row = await transitionListingStatus(
    prisma,
    existing,
    MARKETPLACE_LISTING_STATUS.UNPUBLISHED,
    'creator',
    {
      actorUserId: userId,
      eventType: 'marketplace_listing_unpublished_by_creator',
    },
    {
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
      unpublishedAt: new Date(),
    },
  );
  return toListingDto(row);
}

export async function archiveMarketplaceListingForCreator(
  userId,
  listingId,
  prisma = getPrismaClient(),
) {
  const seller = await getSellerForUser(userId, prisma);
  const existing = await getOwnedListingOrThrow(prisma, listingId, seller.id);
  if (
    ![
      MARKETPLACE_LISTING_STATUS.UNPUBLISHED,
      MARKETPLACE_LISTING_STATUS.REJECTED,
      MARKETPLACE_LISTING_STATUS.DRAFT,
    ].includes(existing.listingStatus)
  ) {
    throw createMarketplaceError(
      'invalid_transition',
      'Marketplace listing must be unpublished, rejected, or draft before archiving.',
      422,
    );
  }
  const row = await prisma.marketplaceListing.update({
    where: { id: existing.id },
    data: {
      listingStatus: MARKETPLACE_LISTING_STATUS.ARCHIVED,
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
      activeSourceKey: null,
      archivedAt: new Date(),
    },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  await appendMarketplaceListingEvent(
    {
      listingId: existing.id,
      eventType: 'marketplace_listing_archived',
      previousStatus: existing.listingStatus,
      newStatus: MARKETPLACE_LISTING_STATUS.ARCHIVED,
      actorUserId: userId,
      actorRole: 'creator',
    },
    prisma,
  );
  return toListingDto(row);
}

export async function listMarketplaceListingQueue(opts = {}, prisma = getPrismaClient()) {
  const statusFilter = opts.status
    ? String(opts.status).trim().toUpperCase()
    : MARKETPLACE_LISTING_STATUS.SUBMITTED;
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const rows = await prisma.marketplaceListing.findMany({
    where: { listingStatus: statusFilter },
    orderBy: { submittedAt: 'asc' },
    take: limit,
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  return rows.map(toListingDto);
}

export async function getMarketplaceListingDetail(listingId, prisma = getPrismaClient()) {
  const row = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
      events: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!row) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  return {
    listing: toListingDto(row),
    events: row.events ?? [],
  };
}

export async function approveMarketplaceListing(
  listingId,
  input = {},
  context = {},
  prisma = getPrismaClient(),
) {
  const detail = await getMarketplaceListingDetail(listingId, prisma);
  const existing = detail.listing;
  const raw = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  const row = await transitionListingStatus(
    prisma,
    raw,
    MARKETPLACE_LISTING_STATUS.APPROVED,
    'admin',
    {
      actorUserId: context.actorUserId,
      eventType: 'marketplace_listing_approved',
      reason: normalizeText(input.reason),
    },
    {
      approvedAt: new Date(),
      approvedByUserId: context.actorUserId ?? null,
      reviewReason: normalizeText(input.reason),
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
    },
  );
  return {
    ...toListingDto(row),
    previousStatus: existing.listingStatus,
  };
}

export async function requestMarketplaceListingChanges(
  listingId,
  input = {},
  context = {},
  prisma = getPrismaClient(),
) {
  const existing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  if (!existing) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  const row = await transitionListingStatus(
    prisma,
    existing,
    MARKETPLACE_LISTING_STATUS.CHANGES_REQUESTED,
    'admin',
    {
      actorUserId: context.actorUserId,
      eventType: 'marketplace_listing_changes_requested',
      reason: normalizeText(input.reason),
    },
    {
      reviewReason: normalizeText(input.reason),
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
    },
  );
  return toListingDto(row);
}

export async function rejectMarketplaceListing(
  listingId,
  input = {},
  context = {},
  prisma = getPrismaClient(),
) {
  const existing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  if (!existing) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  const row = await transitionListingStatus(
    prisma,
    existing,
    MARKETPLACE_LISTING_STATUS.REJECTED,
    'admin',
    {
      actorUserId: context.actorUserId,
      eventType: 'marketplace_listing_rejected',
      reason: normalizeText(input.reason),
    },
    {
      reviewReason: normalizeText(input.reason),
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
    },
  );
  return toListingDto(row);
}

export async function publishMarketplaceListing(
  listingId,
  context = {},
  prisma = getPrismaClient(),
) {
  const existing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  if (!existing) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  const eligibility = evaluateMarketplaceListingEligibility({
    sellerStatus: existing.seller?.status,
    creatorId: existing.creatorId,
    content: existing.sourceContent,
  });
  if (!eligibility.eligible) {
    throw createMarketplaceError(
      'eligibility_failed',
      'Marketplace listing can no longer be published.',
      422,
      { reasons: eligibility.reasons },
    );
  }
  const row = await transitionListingStatus(
    prisma,
    existing,
    MARKETPLACE_LISTING_STATUS.PUBLISHED,
    'admin',
    {
      actorUserId: context.actorUserId,
      eventType: 'marketplace_listing_published',
    },
    {
      publishedAt: new Date(),
      publishedByUserId: context.actorUserId ?? null,
      unpublishedAt: null,
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.AVAILABLE,
    },
  );
  return toListingDto(row);
}

export async function suspendMarketplaceListing(
  listingId,
  input = {},
  context = {},
  prisma = getPrismaClient(),
) {
  const existing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  if (!existing) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  const row = await transitionListingStatus(
    prisma,
    existing,
    MARKETPLACE_LISTING_STATUS.SUSPENDED,
    'admin',
    {
      actorUserId: context.actorUserId,
      eventType: 'marketplace_listing_suspended',
      reason: normalizeText(input.reason),
    },
    {
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
      suspendedAt: new Date(),
      restorableStatus: existing.listingStatus,
      reviewReason: normalizeText(input.reason),
    },
  );
  return toListingDto(row);
}

export async function restoreMarketplaceListing(
  listingId,
  context = {},
  prisma = getPrismaClient(),
) {
  const existing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  if (!existing) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  const targetStatus = existing.restorableStatus || MARKETPLACE_LISTING_STATUS.APPROVED;
  const nextAvailability =
    targetStatus === MARKETPLACE_LISTING_STATUS.PUBLISHED
      ? MARKETPLACE_AVAILABILITY_STATUS.AVAILABLE
      : MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE;
  const row = await transitionListingStatus(
    prisma,
    existing,
    targetStatus,
    'admin',
    {
      actorUserId: context.actorUserId,
      eventType: 'marketplace_listing_restored',
    },
    {
      availabilityStatus: nextAvailability,
      suspendedAt: null,
    },
  );
  return toListingDto(row);
}

export async function unpublishMarketplaceListingForAdmin(
  listingId,
  context = {},
  prisma = getPrismaClient(),
) {
  const existing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          creatorId: true,
          type: true,
          title: true,
          description: true,
          language: true,
          durationSeconds: true,
          thumbnail: true,
          mediaUrl: true,
          status: true,
          visibility: true,
          publishedAt: true,
        },
      },
      ownershipDeclaration: true,
      assetProvenance: true,
    },
  });
  if (!existing) {
    throw createMarketplaceError('listing_not_found', 'Marketplace listing not found.', 404);
  }
  const row = await transitionListingStatus(
    prisma,
    existing,
    MARKETPLACE_LISTING_STATUS.UNPUBLISHED,
    'admin',
    {
      actorUserId: context.actorUserId,
      eventType: 'marketplace_listing_unpublished_by_admin',
    },
    {
      availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.UNAVAILABLE,
      unpublishedAt: new Date(),
    },
  );
  return toListingDto(row);
}

export default {
  listMyMarketplaceListings,
  createMarketplaceListingDraft,
  getMyMarketplaceListing,
  updateMarketplaceListingDraft,
  submitMarketplaceListing,
  unpublishMarketplaceListingForCreator,
  archiveMarketplaceListingForCreator,
  listMarketplaceListingQueue,
  getMarketplaceListingDetail,
  approveMarketplaceListing,
  requestMarketplaceListingChanges,
  rejectMarketplaceListing,
  publishMarketplaceListing,
  suspendMarketplaceListing,
  restoreMarketplaceListing,
  unpublishMarketplaceListingForAdmin,
};
