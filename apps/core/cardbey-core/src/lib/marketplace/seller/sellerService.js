import { getPrismaClient } from '../../prisma.js';
import { createMarketplaceError } from '../errors.js';
import { MARKETPLACE_SELLER_STATUS } from '../types.js';
import { appendMarketplaceSellerStatusEvent } from './sellerAuditService.js';
import { logMarketplaceTelemetry } from '../telemetry.js';

const SELLER_TRANSITIONS = Object.freeze({
  approve: {
    from: [
      MARKETPLACE_SELLER_STATUS.PENDING,
      MARKETPLACE_SELLER_STATUS.REJECTED,
      MARKETPLACE_SELLER_STATUS.RESTRICTED,
      MARKETPLACE_SELLER_STATUS.SUSPENDED,
    ],
    to: MARKETPLACE_SELLER_STATUS.APPROVED,
  },
  reject: {
    from: [
      MARKETPLACE_SELLER_STATUS.PENDING,
      MARKETPLACE_SELLER_STATUS.APPROVED,
      MARKETPLACE_SELLER_STATUS.RESTRICTED,
    ],
    to: MARKETPLACE_SELLER_STATUS.REJECTED,
  },
  restrict: {
    from: [MARKETPLACE_SELLER_STATUS.APPROVED],
    to: MARKETPLACE_SELLER_STATUS.RESTRICTED,
  },
  suspend: {
    from: [
      MARKETPLACE_SELLER_STATUS.PENDING,
      MARKETPLACE_SELLER_STATUS.APPROVED,
      MARKETPLACE_SELLER_STATUS.RESTRICTED,
    ],
    to: MARKETPLACE_SELLER_STATUS.SUSPENDED,
  },
  restore: {
    from: [
      MARKETPLACE_SELLER_STATUS.RESTRICTED,
      MARKETPLACE_SELLER_STATUS.SUSPENDED,
    ],
    to: MARKETPLACE_SELLER_STATUS.APPROVED,
  },
});

function toSellerProfileDto(row) {
  if (!row) {
    return {
      sellerId: null,
      status: MARKETPLACE_SELLER_STATUS.NOT_APPLIED,
    };
  }

  return {
    sellerId: row.id,
    userId: row.userId,
    creatorId: row.creatorId,
    displayName: row.displayName ?? null,
    countryCode: row.countryCode ?? null,
    defaultCurrency: row.defaultCurrency ?? 'AUD',
    status: row.status,
    applicationVersion: row.applicationVersion ?? '1',
    termsAcceptedAt: row.termsAcceptedAt ?? null,
    rightsPolicyAcceptedAt: row.rightsPolicyAcceptedAt ?? null,
    applicationBio: row.applicationBio ?? null,
    applicationMotivation: row.applicationMotivation ?? null,
    applicationPortfolioUrl: row.applicationPortfolioUrl ?? null,
    applicationLanguages: Array.isArray(row.applicationLanguages) ? row.applicationLanguages : [],
    applicationNotes: row.applicationNotes ?? null,
    reviewReason: row.reviewReason ?? null,
    restrictionReason: row.restrictionReason ?? null,
    adminNotes: row.adminNotes ?? null,
    reviewedByUserId: row.reviewedByUserId ?? null,
    reviewedAt: row.reviewedAt ?? null,
    approvedAt: row.approvedAt ?? null,
    restrictedAt: row.restrictedAt ?? null,
    suspendedAt: row.suspendedAt ?? null,
    restoredAt: row.restoredAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    creator: row.creator
      ? {
          creatorId: row.creator.id,
          username: row.creator.username,
          displayName: row.creator.displayName ?? null,
          isQualified: Boolean(row.creator.isQualified),
          creatorStatus: row.creator.creatorStatus,
        }
      : null,
  };
}

function parseAcceptedAt(input, keyBoolean, keyTimestamp) {
  if (input?.[keyBoolean] === true || input?.[keyBoolean] === 'true') {
    return new Date();
  }
  if (input?.[keyTimestamp]) {
    const parsed = new Date(input[keyTimestamp]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function normalizeApplicationInput(input = {}, { requireAcceptances = false } = {}) {
  const displayName =
    typeof input.displayName === 'string' && input.displayName.trim()
      ? input.displayName.trim()
      : null;
  const countryCode =
    typeof input.countryCode === 'string' && input.countryCode.trim()
      ? input.countryCode.trim().toUpperCase()
      : null;
  const defaultCurrency =
    typeof input.defaultCurrency === 'string' && input.defaultCurrency.trim()
      ? input.defaultCurrency.trim().toUpperCase()
      : 'AUD';

  const termsAcceptedAt = parseAcceptedAt(input, 'termsAccepted', 'termsAcceptedAt');
  const rightsPolicyAcceptedAt = parseAcceptedAt(
    input,
    'rightsPolicyAccepted',
    'rightsPolicyAcceptedAt',
  );

  if (requireAcceptances) {
    if (!displayName) {
      throw createMarketplaceError('invalid_seller_application', 'displayName is required.', 422);
    }
    if (!countryCode) {
      throw createMarketplaceError('invalid_seller_application', 'countryCode is required.', 422);
    }
    if (!termsAcceptedAt) {
      throw createMarketplaceError(
        'invalid_seller_application',
        'Marketplace terms must be accepted.',
        422,
      );
    }
    if (!rightsPolicyAcceptedAt) {
      throw createMarketplaceError(
        'invalid_seller_application',
        'Rights and provenance policy must be accepted.',
        422,
      );
    }
  }

  return {
    ...(displayName ? { displayName } : {}),
    ...(countryCode ? { countryCode } : {}),
    defaultCurrency,
    applicationVersion:
      typeof input.applicationVersion === 'string' && input.applicationVersion.trim()
        ? input.applicationVersion.trim()
        : '1',
    ...(termsAcceptedAt ? { termsAcceptedAt } : {}),
    ...(rightsPolicyAcceptedAt ? { rightsPolicyAcceptedAt } : {}),
    applicationBio:
      typeof input.applicationBio === 'string' && input.applicationBio.trim()
        ? input.applicationBio.trim()
        : null,
    applicationMotivation:
      typeof input.applicationMotivation === 'string' && input.applicationMotivation.trim()
        ? input.applicationMotivation.trim()
        : null,
    applicationPortfolioUrl:
      typeof input.applicationPortfolioUrl === 'string' && input.applicationPortfolioUrl.trim()
        ? input.applicationPortfolioUrl.trim()
        : null,
    applicationLanguages: Array.isArray(input.applicationLanguages)
      ? input.applicationLanguages
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [],
    applicationNotes:
      typeof input.applicationNotes === 'string' && input.applicationNotes.trim()
        ? input.applicationNotes.trim()
        : null,
  };
}

async function getCreatorForUser(userId, prisma) {
  const creator = await prisma.creator.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      username: true,
      displayName: true,
      isQualified: true,
      creatorStatus: true,
    },
  });
  if (!creator) {
    throw createMarketplaceError(
      'creator_required',
      'Creator profile is required before applying as a marketplace seller.',
      404,
    );
  }
  return creator;
}

export async function getMyProfile(userId, prisma = getPrismaClient()) {
  const creator = await prisma.creator.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      username: true,
      displayName: true,
      isQualified: true,
      creatorStatus: true,
    },
  });
  const row = await prisma.marketplaceSellerProfile.findUnique({
    where: { userId },
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isQualified: true,
          creatorStatus: true,
        },
      },
    },
  });
  const dto = toSellerProfileDto(row);
  if (!row) {
    dto.creator = creator
      ? {
          creatorId: creator.id,
          username: creator.username,
          displayName: creator.displayName ?? null,
          isQualified: Boolean(creator.isQualified),
          creatorStatus: creator.creatorStatus,
        }
      : null;
  }
  return dto;
}

export async function applyMarketplaceSeller(userId, input = {}, prisma = getPrismaClient()) {
  const creator = await getCreatorForUser(userId, prisma);
  const existing = await prisma.marketplaceSellerProfile.findUnique({
    where: { userId },
  });
  if (existing) {
    throw createMarketplaceError(
      'seller_application_exists',
      'Marketplace seller application already exists for this account.',
      409,
    );
  }

  const payload = normalizeApplicationInput(input, { requireAcceptances: true });
  const row = await prisma.marketplaceSellerProfile.create({
    data: {
      userId,
      creatorId: creator.id,
      status: MARKETPLACE_SELLER_STATUS.PENDING,
      ...payload,
    },
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isQualified: true,
          creatorStatus: true,
        },
      },
    },
  });

  await appendMarketplaceSellerStatusEvent(
    {
      sellerId: row.id,
      eventType: 'marketplace_seller_applied',
      previousStatus: null,
      newStatus: MARKETPLACE_SELLER_STATUS.PENDING,
      actorUserId: userId,
      actorRole: 'creator',
    },
    prisma,
  );

  logMarketplaceTelemetry('marketplace_seller_applied', {
    sellerId: row.id,
    creatorId: creator.id,
    status: row.status,
  });

  return toSellerProfileDto(row);
}

export async function updateMarketplaceSellerApplication(
  userId,
  input = {},
  prisma = getPrismaClient(),
) {
  const existing = await prisma.marketplaceSellerProfile.findUnique({
    where: { userId },
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isQualified: true,
          creatorStatus: true,
        },
      },
    },
  });

  if (!existing) {
    throw createMarketplaceError(
      'seller_not_applied',
      'Marketplace seller application has not been started.',
      404,
    );
  }
  if (existing.status !== MARKETPLACE_SELLER_STATUS.PENDING) {
    throw createMarketplaceError(
      'invalid_transition',
      'Only pending seller applications can be updated.',
      422,
    );
  }

  const payload = normalizeApplicationInput(input);
  const row = await prisma.marketplaceSellerProfile.update({
    where: { id: existing.id },
    data: payload,
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isQualified: true,
          creatorStatus: true,
        },
      },
    },
  });

  logMarketplaceTelemetry('marketplace_seller_application_updated', {
    sellerId: row.id,
    creatorId: row.creatorId,
    status: row.status,
  });

  return toSellerProfileDto(row);
}

export async function listMarketplaceSellerQueue(opts = {}, prisma = getPrismaClient()) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const rows = await prisma.marketplaceSellerProfile.findMany({
    where: { status: MARKETPLACE_SELLER_STATUS.PENDING },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isQualified: true,
          creatorStatus: true,
        },
      },
    },
  });
  return rows.map(toSellerProfileDto);
}

export async function reviewMarketplaceSeller(
  sellerId,
  input = {},
  context = {},
  prisma = getPrismaClient(),
) {
  const action = String(input.action || '').trim().toLowerCase();
  const transition = SELLER_TRANSITIONS[action];
  if (!transition) {
    throw createMarketplaceError('invalid_action', 'Unsupported seller review action.', 422);
  }

  const existing = await prisma.marketplaceSellerProfile.findUnique({
    where: { id: sellerId },
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isQualified: true,
          creatorStatus: true,
        },
      },
    },
  });
  if (!existing) {
    throw createMarketplaceError('seller_not_found', 'Marketplace seller profile not found.', 404);
  }

  if (!transition.from.includes(existing.status)) {
    throw createMarketplaceError(
      'invalid_transition',
      `Cannot move seller from ${existing.status} with action ${action}.`,
      422,
    );
  }

  const now = new Date();
  const data = {
    status: transition.to,
    reviewReason:
      typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null,
    adminNotes:
      typeof input.adminNotes === 'string' && input.adminNotes.trim()
        ? input.adminNotes.trim()
        : null,
    reviewedByUserId: context.actorUserId ?? null,
    reviewedAt: now,
  };

  if (transition.to === MARKETPLACE_SELLER_STATUS.APPROVED) {
    data.approvedAt = existing.approvedAt ?? now;
    data.restoredAt = action === 'restore' ? now : existing.restoredAt;
  }
  if (transition.to === MARKETPLACE_SELLER_STATUS.RESTRICTED) {
    data.restrictedAt = now;
    data.restrictionReason = data.reviewReason;
  }
  if (transition.to === MARKETPLACE_SELLER_STATUS.SUSPENDED) {
    data.suspendedAt = now;
  }

  const row = await prisma.marketplaceSellerProfile.update({
    where: { id: sellerId },
    data,
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isQualified: true,
          creatorStatus: true,
        },
      },
    },
  });

  await appendMarketplaceSellerStatusEvent(
    {
      sellerId,
      eventType: `marketplace_seller_${action}`,
      previousStatus: existing.status,
      newStatus: row.status,
      actorUserId: context.actorUserId ?? null,
      actorRole: context.actorRole ?? 'admin',
      reason: data.reviewReason,
      metadata: {
        adminNotes: data.adminNotes,
      },
    },
    prisma,
  );

  logMarketplaceTelemetry('marketplace_seller_reviewed', {
    sellerId,
    previousStatus: existing.status,
    newStatus: row.status,
    action,
  });

  return {
    ...toSellerProfileDto(row),
    previousStatus: existing.status,
  };
}
