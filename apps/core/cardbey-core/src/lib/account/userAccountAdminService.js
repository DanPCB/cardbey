/**
 * Admin User Account Management — list, detail, governed status/capability changes.
 */

import { getPrismaClient } from '../prisma.js';
import { caseInsensitiveFilter } from '../dbCapabilities.js';
import {
  ensureAccountProfile,
  addAccountCapability,
  removeAccountCapability,
} from './accountProfileService.js';
import { toPublicAccountProfile, inferCapabilities } from './accountProfileResolver.js';
import {
  ACCOUNT_CAPABILITY,
  ACCOUNT_STATUS,
  canTransitionAccountStatus,
} from './accountProfileTypes.js';
import { appendUserAccountEvent, listUserAccountEvents } from './userAccountEventService.js';

const USER_LIST_INCLUDE = {
  accountProfile: true,
  creator: true,
  businesses: { select: { id: true, name: true, slug: true } },
};

/**
 * @param {object} opts
 */
export async function listUserAccounts(opts = {}) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
  const q = String(opts.q || '').trim();

  /** @type {import('@prisma/client').Prisma.UserWhereInput} */
  const where = {};
  if (opts.status) {
    where.accountProfile = { accountStatus: String(opts.status) };
  }
  if (opts.capability === 'CREATOR') {
    where.creator = { isNot: null };
  }
  if (opts.capability === 'BUSINESS_OWNER') {
    where.OR = [{ hasBusiness: true }, { businesses: { some: {} } }];
  }
  if (q) {
    const filter = caseInsensitiveFilter(q, 'contains');
    where.OR = [
      ...(where.OR ?? []),
      { email: filter },
      { displayName: filter },
      { fullName: filter },
      { handle: filter },
      { creator: { username: filter } },
      { creator: { displayName: filter } },
      { businesses: { some: { name: filter } } },
    ];
  }

  const rows = await prisma.user.findMany({
    where,
    include: USER_LIST_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await Promise.all(
    page.map(async (user) => {
      if (!user.accountProfile) await ensureAccountProfile(user.id);
      return toPublicAccountProfile(user, user.accountProfile);
    }),
  );

  return {
    items,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    hasMore,
  };
}

/**
 * @param {string} userId
 */
export async function getUserAccountDetail(userId) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      ...USER_LIST_INCLUDE,
      creator: {
        include: {
          contents: {
            where: { status: { in: ['published', 'owner_review', 'human_review_required', 'ready_to_publish'] } },
            take: 10,
            orderBy: { updatedAt: 'desc' },
          },
        },
      },
    },
  });
  if (!user) return null;
  if (!user.accountProfile) await ensureAccountProfile(userId);
  const profile = toPublicAccountProfile(user, user.accountProfile);
  const events = await listUserAccountEvents(userId, 30);
  return {
    profile,
    businesses: user.businesses ?? [],
    creator: user.creator ?? null,
    recentContent: user.creator?.contents ?? [],
    events,
  };
}

/**
 * @param {string} userId
 * @param {string} nextStatus
 * @param {object} context
 */
export async function updateUserAccountStatus(userId, nextStatus, context = {}) {
  const prisma = getPrismaClient();
  await ensureAccountProfile(userId);
  const profile = await prisma.accountProfile.findUnique({ where: { userId } });
  const from = profile?.accountStatus ?? ACCOUNT_STATUS.ACTIVE;
  const to = String(nextStatus).toUpperCase();
  if (!canTransitionAccountStatus(from, to)) {
    throw new Error(`Invalid account status transition: ${from} → ${to}`);
  }
  const updated = await prisma.accountProfile.update({
    where: { userId },
    data: { accountStatus: to },
  });
  await appendUserAccountEvent({
    userId,
    eventType: to === ACCOUNT_STATUS.ACTIVE ? 'ACCOUNT_RESTORED' : `ACCOUNT_${to}`,
    actorUserId: context.actorUserId ?? null,
    reasonCode: context.reasonCode ?? null,
    publicReason: context.publicReason ?? null,
    internalNote: context.internalNote ?? null,
    previousState: { accountStatus: from },
    nextState: { accountStatus: to },
  });
  return updated;
}

/**
 * @param {string} userId
 * @param {object} input
 * @param {object} context
 */
export async function manageUserCapability(userId, input, context = {}) {
  const action = String(input.action || '').toLowerCase();
  const capability = String(input.capability || '').toUpperCase();
  if (action === 'add') return addAccountCapability(userId, capability, context);
  if (action === 'remove') return removeAccountCapability(userId, capability, context);
  throw new Error('Invalid capability action');
}

/**
 * @param {string} userId
 * @param {object} context
 */
export async function restrictCreatorCapability(userId, context = {}) {
  const prisma = getPrismaClient();
  await ensureAccountProfile(userId);
  const updated = await prisma.accountProfile.update({
    where: { userId },
    data: { creatorPublishingRestricted: true },
  });
  await appendUserAccountEvent({
    userId,
    eventType: 'CREATOR_RESTRICTED',
    actorUserId: context.actorUserId ?? null,
    internalNote: context.internalNote ?? null,
    reasonCode: context.reasonCode ?? 'ADMIN_RESTRICTION',
  });
  return updated;
}

/**
 * @param {string} userId
 * @param {object} context
 */
export async function restoreCreatorCapability(userId, context = {}) {
  const prisma = getPrismaClient();
  await ensureAccountProfile(userId);
  const updated = await prisma.accountProfile.update({
    where: { userId },
    data: { creatorPublishingRestricted: false },
  });
  await appendUserAccountEvent({
    userId,
    eventType: 'CREATOR_RESTORED',
    actorUserId: context.actorUserId ?? null,
    internalNote: context.internalNote ?? null,
  });
  return updated;
}

/**
 * @param {string} userId
 * @param {string} note
 * @param {object} context
 */
export async function addUserAccountNote(userId, note, context = {}) {
  const prisma = getPrismaClient();
  await ensureAccountProfile(userId);
  const profile = await prisma.accountProfile.findUnique({ where: { userId } });
  const notes = Array.isArray(profile?.internalNotes) ? [...profile.internalNotes] : [];
  notes.push({
    text: note,
    at: new Date().toISOString(),
    actorUserId: context.actorUserId ?? null,
  });
  await prisma.accountProfile.update({
    where: { userId },
    data: { internalNotes: notes },
  });
  await appendUserAccountEvent({
    userId,
    eventType: 'ACCOUNT_NOTE_ADDED',
    actorUserId: context.actorUserId ?? null,
    internalNote: note,
  });
  return notes;
}

export default {
  listUserAccounts,
  getUserAccountDetail,
  updateUserAccountStatus,
  manageUserCapability,
  restrictCreatorCapability,
  restoreCreatorCapability,
  addUserAccountNote,
};
